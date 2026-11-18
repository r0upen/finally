"""Fixtures: temp DB and a clean, manually-controlled price cache (no market source)."""

import pytest

from app.database import init_db
from app.services import market


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db()
    return path


@pytest.fixture
def prices():
    """Clear the shared cache; tests set prices with prices.update(ticker, price)."""
    cache = market.price_cache
    for t in list(cache.get_all()):
        cache.remove(t)
    yield cache
    for t in list(cache.get_all()):
        cache.remove(t)
