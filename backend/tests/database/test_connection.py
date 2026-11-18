"""Tests for path resolution, init_db, and transactions."""

import re
import sqlite3

import pytest

from app.database import (
    get_cash,
    get_connection,
    init_db,
    insert_trade,
    list_watchlist,
    resolve_db_path,
    set_cash,
    utc_now_iso,
)
from app.database.connection import PROJECT_ROOT

DEFAULTS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "nested" / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db()
    return path


def test_resolve_uses_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "x.db"))
    assert resolve_db_path() == tmp_path / "x.db"


def test_resolve_default_is_project_root(monkeypatch):
    monkeypatch.delenv("DB_PATH", raising=False)
    assert resolve_db_path() == PROJECT_ROOT / "db" / "finally.db"
    assert (PROJECT_ROOT / "backend").is_dir()


def test_resolve_empty_env_falls_back(monkeypatch):
    monkeypatch.setenv("DB_PATH", "  ")
    assert resolve_db_path() == PROJECT_ROOT / "db" / "finally.db"


def test_init_creates_dir_and_seeds(db):
    assert db.exists()
    with get_connection() as conn:
        assert get_cash(conn) == 10000.0
        assert list_watchlist(conn) == DEFAULTS


def test_init_is_idempotent(db):
    with get_connection() as conn:
        set_cash(conn, 5.0)
    init_db()
    with get_connection() as conn:
        assert get_cash(conn) == 5.0
        assert list_watchlist(conn) == DEFAULTS


def test_emptied_watchlist_not_reseeded(db):
    with get_connection() as conn:
        conn.execute("DELETE FROM watchlist")
    init_db()
    with get_connection() as conn:
        assert list_watchlist(conn) == []


def test_tables_and_user_id_default(db):
    with get_connection() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert tables >= {"users_profile", "watchlist", "positions", "trades",
                          "portfolio_snapshots", "chat_messages"}
        conn.execute("INSERT INTO trades (id, ticker, side, quantity, price, executed_at) "
                     "VALUES ('t1', 'AAPL', 'buy', 1, 1, 'now')")
        row = conn.execute("SELECT user_id FROM trades WHERE id='t1'").fetchone()
        assert row["user_id"] == "default"


def test_row_factory(db):
    with get_connection() as conn:
        row = conn.execute("SELECT cash_balance FROM users_profile").fetchone()
        assert isinstance(row, sqlite3.Row)


def test_commit_on_success(db):
    with get_connection() as conn:
        set_cash(conn, 123.0)
        insert_trade(conn, "AAPL", "buy", 1, 1.0)
    with get_connection() as conn:
        assert get_cash(conn) == 123.0
        assert conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0] == 1


def test_rollback_on_exception(db):
    with pytest.raises(RuntimeError):
        with get_connection() as conn:
            set_cash(conn, 1.0)
            insert_trade(conn, "AAPL", "buy", 1, 1.0)
            raise RuntimeError("boom")
    with get_connection() as conn:
        assert get_cash(conn) == 10000.0
        assert conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0] == 0


def test_explicit_path_overrides_env(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "env.db"))
    other = tmp_path / "other.db"
    init_db(other)
    with get_connection(other) as conn:
        assert get_cash(conn) == 10000.0
    assert not (tmp_path / "env.db").exists()


def test_utc_now_iso_format():
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", utc_now_iso())
