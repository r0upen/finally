"""Watchlist service and tracked-ticker rules (PLAN Section 6)."""

import pytest

from app.services import market
from app.services.portfolio import execute_trade
from app.services.watchlist import (
    DuplicateTickerError,
    InvalidTickerError,
    TickerNotFoundError,
    add_ticker,
    get_watchlist,
    remove_ticker,
)


class FakeSource:
    def __init__(self):
        self.tickers: set[str] = set()

    async def add_ticker(self, t):
        self.tickers.add(t)
        market.price_cache.update(t, 100.0)

    async def remove_ticker(self, t):
        self.tickers.discard(t)
        market.price_cache.remove(t)


@pytest.fixture
def source(monkeypatch):
    fake = FakeSource()
    monkeypatch.setattr(market, "_source", fake)
    return fake


async def test_add_normalizes_and_tracks(db, prices, source):
    assert await add_ticker(" pypl ") == "PYPL"
    assert "PYPL" in source.tickers
    assert get_watchlist()[-1] == {
        "ticker": "PYPL", "price": 100.0, "previous_price": 100.0, "direction": "flat"
    }


async def test_watchlist_price_null_before_first_price(db, prices):
    assert get_watchlist()[0]["price"] is None


async def test_add_errors(db, prices, source):
    with pytest.raises(InvalidTickerError):
        await add_ticker("TOOLONG")
    with pytest.raises(DuplicateTickerError) as exc:
        await add_ticker("aapl")
    assert exc.value.status_code == 409


async def test_remove_untracks_when_not_held(db, prices, source):
    await add_ticker("PYPL")
    await remove_ticker("PYPL")
    assert "PYPL" not in source.tickers
    with pytest.raises(TickerNotFoundError):
        await remove_ticker("PYPL")


async def test_held_ticker_stays_tracked_until_sold(db, prices, source):
    await add_ticker("PYPL")
    await execute_trade("PYPL", "buy", 5)
    await remove_ticker("PYPL")
    assert "PYPL" in source.tickers  # still held
    await execute_trade("PYPL", "sell", 5)
    assert "PYPL" not in source.tickers  # closed and not on watchlist


async def test_closing_position_keeps_watchlist_ticker_tracked(db, prices, source):
    await add_ticker("PYPL")
    await execute_trade("PYPL", "buy", 5)
    await execute_trade("PYPL", "sell", 5)
    assert "PYPL" in source.tickers
