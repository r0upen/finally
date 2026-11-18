"""Trade execution and P&L math."""

import pytest

from app.database import get_connection, list_snapshots
from app.services.portfolio import TradeError, execute_trade, get_portfolio


async def test_buy_debits_cash_and_creates_position(db, prices):
    prices.update("AAPL", 190.0)
    result = await execute_trade("aapl", "buy", 10)
    assert result["cash_balance"] == 8100.0
    assert result["trade"]["ticker"] == "AAPL"
    assert result["trade"]["price"] == 190.0
    p = get_portfolio()
    assert p["positions"][0]["quantity"] == 10
    assert p["positions"][0]["avg_cost"] == 190.0


async def test_buy_twice_averages_cost(db, prices):
    prices.update("AAPL", 100.0)
    await execute_trade("AAPL", "buy", 10)
    prices.update("AAPL", 200.0)
    await execute_trade("AAPL", "buy", 10)
    pos = get_portfolio()["positions"][0]
    assert pos["quantity"] == 20
    assert pos["avg_cost"] == 150.0


async def test_unrealized_pnl(db, prices):
    prices.update("AAPL", 190.0)
    await execute_trade("AAPL", "buy", 10)
    prices.update("AAPL", 205.05)
    p = get_portfolio()
    pos = p["positions"][0]
    assert pos["market_value"] == 2050.5
    assert pos["unrealized_pnl"] == 150.5
    assert pos["pnl_percent"] == 7.92
    assert p["total_value"] == 10150.5
    assert p["unrealized_pnl"] == 150.5


async def test_sell_at_loss(db, prices):
    prices.update("AAPL", 200.0)
    await execute_trade("AAPL", "buy", 10)
    prices.update("AAPL", 150.0)
    result = await execute_trade("AAPL", "sell", 4)
    assert result["cash_balance"] == 10000 - 2000 + 600
    pos = get_portfolio()["positions"][0]
    assert pos["quantity"] == 6
    assert pos["avg_cost"] == 200.0
    assert pos["unrealized_pnl"] == -300.0


async def test_sell_all_deletes_position(db, prices):
    prices.update("AAPL", 190.0)
    await execute_trade("AAPL", "buy", 0.3)
    await execute_trade("AAPL", "sell", 0.1)
    await execute_trade("AAPL", "sell", 0.2)  # float residue must count as zero
    assert get_portfolio()["positions"] == []


async def test_insufficient_cash(db, prices):
    prices.update("AAPL", 190.0)
    with pytest.raises(TradeError, match=r"Insufficient cash: need \$19,000.00, have \$10,000.00"):
        await execute_trade("AAPL", "buy", 100)
    assert get_portfolio()["cash_balance"] == 10000.0


async def test_sell_more_than_owned(db, prices):
    prices.update("AAPL", 190.0)
    await execute_trade("AAPL", "buy", 1)
    with pytest.raises(TradeError, match="Insufficient shares"):
        await execute_trade("AAPL", "sell", 2)


async def test_sell_without_position(db, prices):
    prices.update("AAPL", 190.0)
    with pytest.raises(TradeError, match="Insufficient shares"):
        await execute_trade("AAPL", "sell", 1)


@pytest.mark.parametrize(
    "ticker,side,qty,msg",
    [
        ("AAPL", "buy", 0, "greater than 0"),
        ("AAPL", "buy", -1, "greater than 0"),
        ("AAPL", "hold", 1, "Invalid side"),
        ("AAPL1", "buy", 1, "Invalid ticker"),
        ("ZZZZ", "buy", 1, "No price available"),
    ],
)
async def test_validation(db, prices, ticker, side, qty, msg):
    prices.update("AAPL", 190.0)
    with pytest.raises(TradeError, match=msg):
        await execute_trade(ticker, side, qty)


async def test_trade_records_snapshot_and_failure_rolls_back(db, prices):
    prices.update("AAPL", 190.0)
    with get_connection() as conn:
        before = len(list_snapshots(conn))
    await execute_trade("AAPL", "buy", 10)
    with pytest.raises(TradeError):
        await execute_trade("AAPL", "buy", 1000)
    with get_connection() as conn:
        snaps = list_snapshots(conn)
    assert len(snaps) == before + 1
    assert snaps[-1]["total_value"] == 10000.0
