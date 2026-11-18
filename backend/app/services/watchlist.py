"""Watchlist business logic. Keeps market data tracking in sync."""

from app.database import (
    DuplicateError,
    add_watchlist,
    get_connection,
    list_watchlist,
    remove_watchlist,
)

from . import market


class WatchlistError(ValueError):
    """Base watchlist error; status_code maps to the HTTP response."""

    status_code = 400


class InvalidTickerError(WatchlistError):
    status_code = 400


class DuplicateTickerError(WatchlistError):
    status_code = 409


class TickerNotFoundError(WatchlistError):
    status_code = 404


def _normalize(ticker: str) -> str:
    t = market.normalize_ticker(ticker)
    if t is None:
        raise InvalidTickerError(f"Invalid ticker '{ticker}': must be 1-5 letters")
    return t


def get_watchlist() -> list[dict]:
    """GET /api/watchlist shape; price fields are None until a price arrives."""
    with get_connection() as conn:
        tickers = list_watchlist(conn)
    result = []
    for t in tickers:
        u = market.price_cache.get(t)
        result.append({
            "ticker": t,
            "price": u.price if u else None,
            "previous_price": u.previous_price if u else None,
            "direction": u.direction if u else None,
        })
    return result


async def add_ticker(ticker: str) -> str:
    """Add to the watchlist and start tracking. Returns the normalized ticker."""
    t = _normalize(ticker)
    try:
        with get_connection() as conn:
            add_watchlist(conn, t)
    except DuplicateError:
        raise DuplicateTickerError(f"{t} is already on the watchlist") from None
    await market.track(t)
    return t


async def remove_ticker(ticker: str) -> None:
    """Remove from the watchlist; stop tracking unless a position is held."""
    t = _normalize(ticker)
    with get_connection() as conn:
        removed = remove_watchlist(conn, t)
    if not removed:
        raise TickerNotFoundError(f"{t} is not on the watchlist")
    await market.untrack_if_unused(t)
