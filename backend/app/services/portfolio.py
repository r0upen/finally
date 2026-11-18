"""Portfolio valuation and trade execution."""

import math
import sqlite3

from app.database import (
    ZERO_QTY,
    delete_position,
    get_cash,
    get_connection,
    get_position,
    get_positions,
    insert_snapshot,
    insert_trade,
    is_zero_qty,
    set_cash,
    upsert_position,
)

from . import market


class TradeError(ValueError):
    """A trade failed validation; str(exc) is shown to the user."""


def _price_or_cost(ticker: str, avg_cost: float) -> float:
    """Live price, falling back to avg cost until the first price arrives."""
    price = market.price_cache.get_price(ticker)
    return price if price is not None else avg_cost


def total_value(conn: sqlite3.Connection) -> float:
    """Cash plus market value of all positions."""
    value = get_cash(conn)
    for p in get_positions(conn):
        value += p["quantity"] * _price_or_cost(p["ticker"], p["avg_cost"])
    return round(value, 2)


def record_snapshot() -> dict:
    """Insert a portfolio_snapshots row with the current total value."""
    with get_connection() as conn:
        return insert_snapshot(conn, total_value(conn))


def get_portfolio() -> dict:
    """GET /api/portfolio response shape."""
    with get_connection() as conn:
        cash = get_cash(conn)
        rows = get_positions(conn)
    positions = []
    for p in rows:
        price = _price_or_cost(p["ticker"], p["avg_cost"])
        cost_basis = p["quantity"] * p["avg_cost"]
        market_value = p["quantity"] * price
        pnl = market_value - cost_basis
        positions.append({
            "ticker": p["ticker"],
            "quantity": p["quantity"],
            "avg_cost": round(p["avg_cost"], 4),
            "current_price": round(price, 2),
            "market_value": round(market_value, 2),
            "unrealized_pnl": round(pnl, 2),
            "pnl_percent": round(pnl / cost_basis * 100, 2) if cost_basis else 0.0,
        })
    invested = sum(p["market_value"] for p in positions)
    return {
        "cash_balance": round(cash, 2),
        "total_value": round(cash + invested, 2),
        "unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions), 2),
        "positions": positions,
    }


def _validate(ticker: str, side: str, quantity: float) -> tuple[str, str, float, float]:
    t = market.normalize_ticker(ticker)
    if t is None:
        raise TradeError(f"Invalid ticker '{ticker}': must be 1-5 letters")
    side = (side or "").strip().lower()
    if side not in ("buy", "sell"):
        raise TradeError(f"Invalid side '{side}': must be 'buy' or 'sell'")
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        raise TradeError("Quantity must be a number") from None
    if not math.isfinite(quantity) or quantity <= 0:
        raise TradeError("Quantity must be greater than 0")
    price = market.price_cache.get_price(t)
    if price is None:
        raise TradeError(f"No price available for {t}; add it to the watchlist first")
    return t, side, quantity, price


async def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Execute a market order at the cached price, in one SQLite transaction.

    Returns the POST /api/portfolio/trade response shape. Raises TradeError.
    """
    t, side, quantity, price = _validate(ticker, side, quantity)
    closed = False
    with get_connection() as conn:
        cash = get_cash(conn)
        pos = get_position(conn, t)
        held = pos["quantity"] if pos else 0.0
        if side == "buy":
            cost = quantity * price
            if cost > cash + 1e-6:
                raise TradeError(f"Insufficient cash: need ${cost:,.2f}, have ${cash:,.2f}")
            new_qty = held + quantity
            avg = (held * pos["avg_cost"] + cost) / new_qty if pos else price
            upsert_position(conn, t, new_qty, avg)
            set_cash(conn, cash - cost)
        else:
            if quantity > held + ZERO_QTY:
                raise TradeError(f"Insufficient shares: have {held:g} {t}, tried to sell {quantity:g}")
            new_qty = held - quantity
            if is_zero_qty(new_qty):
                delete_position(conn, t)
                closed = True
            else:
                upsert_position(conn, t, new_qty, pos["avg_cost"])
            set_cash(conn, cash + quantity * price)
        trade = insert_trade(conn, t, side, quantity, price)
        insert_snapshot(conn, total_value(conn))
        new_cash = get_cash(conn)
    if closed:
        await market.untrack_if_unused(t)
    return {"trade": trade, "cash_balance": round(new_cash, 2)}
