"""Fixtures: temp database, mock LLM mode, and fake portfolio/watchlist services."""

from types import SimpleNamespace

import pytest

from app.database import init_db
from app.llm import service


class FakeTradeError(ValueError):
    pass


class FakeWatchlistError(ValueError):
    pass


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db(path)
    return path


@pytest.fixture
def fake_services(monkeypatch):
    """Replace portfolio/watchlist services; record calls."""
    calls = []
    watched = {"AAPL", "NVDA"}

    async def execute_trade(ticker, side, quantity):
        calls.append(("trade", ticker, side, quantity))
        if ticker.upper() == "ZZZZ":
            raise FakeTradeError("No price available for ZZZZ")
        trade = {"id": "t1", "ticker": ticker.upper(), "side": side, "quantity": quantity,
                 "price": 100.0, "executed_at": "2026-11-10T14:00:00Z"}
        return {"trade": trade, "cash_balance": 9000.0}

    async def add_ticker(ticker):
        calls.append(("add", ticker))
        if ticker.upper() in watched:
            raise FakeWatchlistError("Already on watchlist")
        watched.add(ticker.upper())
        return ticker.upper()

    async def remove_ticker(ticker):
        calls.append(("remove", ticker))
        if ticker.upper() not in watched:
            raise FakeWatchlistError("Not on watchlist")
        watched.discard(ticker.upper())

    portfolio = SimpleNamespace(
        TradeError=FakeTradeError,
        execute_trade=execute_trade,
        get_portfolio=lambda: {"cash_balance": 10000.0, "total_value": 10000.0,
                               "unrealized_pnl": 0.0, "positions": []},
    )
    watchlist = SimpleNamespace(
        WatchlistError=FakeWatchlistError,
        add_ticker=add_ticker,
        remove_ticker=remove_ticker,
        get_watchlist=lambda: [{"ticker": t, "price": 100.0, "previous_price": 99.0,
                                "direction": "up"} for t in sorted(watched)],
    )
    monkeypatch.setattr(service, "portfolio", portfolio)
    monkeypatch.setattr(service, "watchlist", watchlist)
    return calls


@pytest.fixture
def mock_llm(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")
