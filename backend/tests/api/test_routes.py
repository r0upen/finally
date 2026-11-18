"""API status codes and response shapes, with the real lifespan and simulator."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "api.db"))
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_fresh_portfolio(client):
    body = client.get("/api/portfolio").json()
    assert body == {"cash_balance": 10000.0, "total_value": 10000.0,
                    "unrealized_pnl": 0.0, "positions": []}


def test_watchlist_seeded_with_prices(client):
    wl = client.get("/api/watchlist").json()
    assert [w["ticker"] for w in wl][:3] == ["AAPL", "GOOGL", "MSFT"]
    assert len(wl) == 10
    assert set(wl[0]) == {"ticker", "price", "previous_price", "direction"}
    assert wl[0]["price"] > 0


def test_watchlist_crud_status_codes(client):
    r = client.post("/api/watchlist", json={"ticker": "pypl"})
    assert (r.status_code, r.json()) == (201, {"ticker": "PYPL"})
    assert client.post("/api/watchlist", json={"ticker": "PYPL"}).status_code == 409
    assert client.post("/api/watchlist", json={"ticker": "123"}).status_code == 400
    assert client.post("/api/watchlist", json={}).status_code == 422
    assert client.delete("/api/watchlist/pypl").status_code == 204
    assert client.delete("/api/watchlist/PYPL").status_code == 404


def test_trade_flow(client):
    r = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "buy"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"trade", "cash_balance"}
    assert set(body["trade"]) == {"id", "ticker", "side", "quantity", "price", "executed_at"}
    pos = client.get("/api/portfolio").json()["positions"]
    assert set(pos[0]) == {"ticker", "quantity", "avg_cost", "current_price",
                           "market_value", "unrealized_pnl", "pnl_percent"}
    hist = client.get("/api/portfolio/history").json()
    assert len(hist) >= 2  # startup + post-trade
    assert set(hist[0]) == {"total_value", "recorded_at"}


def test_trade_errors(client):
    def trade(**kw):
        return client.post("/api/portfolio/trade", json=kw)

    r = trade(ticker="AAPL", quantity=1_000_000, side="buy")
    assert r.status_code == 400 and r.json()["detail"].startswith("Insufficient cash")
    assert trade(ticker="AAPL", quantity=1, side="sell").status_code == 400
    assert trade(ticker="AAPL", quantity=0, side="buy").status_code == 400
    assert trade(ticker="AAPL", quantity=1, side="short").status_code == 400
    assert trade(ticker="ZZZZ", quantity=1, side="buy").status_code == 400
    assert trade(ticker="AAPL", side="buy").status_code == 422


def test_sse_route_registered(client):
    # The stream itself is infinite; smoke-tested with curl instead.
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/stream/prices" in paths
