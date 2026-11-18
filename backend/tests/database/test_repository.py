"""Tests for repository functions."""

import uuid

import pytest

from app.database import (
    DuplicateError,
    add_watchlist,
    delete_position,
    get_cash,
    get_connection,
    get_position,
    get_positions,
    init_db,
    insert_chat_message,
    insert_snapshot,
    insert_trade,
    is_zero_qty,
    list_chat_messages,
    list_snapshots,
    list_watchlist,
    remove_watchlist,
    set_cash,
    upsert_position,
)


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    init_db()
    with get_connection() as c:
        yield c


def test_cash(conn):
    set_cash(conn, 42.5)
    assert get_cash(conn) == 42.5


def test_cash_unknown_user(conn):
    with pytest.raises(LookupError):
        get_cash(conn, user_id="nobody")


def test_positions_upsert_and_delete(conn):
    assert get_positions(conn) == []
    assert get_position(conn, "AAPL") is None
    upsert_position(conn, "MSFT", 2, 400.0)
    upsert_position(conn, "AAPL", 10, 190.0)
    upsert_position(conn, "AAPL", 15, 195.0)
    pos = get_position(conn, "AAPL")
    assert (pos["quantity"], pos["avg_cost"]) == (15, 195.0)
    assert pos["updated_at"].endswith("Z")
    assert [p["ticker"] for p in get_positions(conn)] == ["AAPL", "MSFT"]
    assert delete_position(conn, "AAPL") is True
    assert delete_position(conn, "AAPL") is False
    assert get_position(conn, "AAPL") is None


def test_positions_isolated_by_user(conn):
    upsert_position(conn, "AAPL", 1, 1.0, user_id="other")
    assert get_positions(conn) == []
    assert len(get_positions(conn, user_id="other")) == 1


def test_is_zero_qty():
    assert is_zero_qty(0.0)
    assert is_zero_qty(1e-10)
    assert is_zero_qty(-1e-10)
    assert not is_zero_qty(1e-8)


def test_insert_trade(conn):
    trade = insert_trade(conn, "AAPL", "sell", 0.5, 190.0)
    uuid.UUID(trade["id"])
    assert trade["side"] == "sell" and trade["quantity"] == 0.5
    assert trade["executed_at"].endswith("Z")
    row = conn.execute("SELECT * FROM trades WHERE id = ?", (trade["id"],)).fetchone()
    assert row["user_id"] == "default" and row["price"] == 190.0


def test_watchlist(conn):
    add_watchlist(conn, "PYPL")
    assert list_watchlist(conn)[-1] == "PYPL"
    with pytest.raises(DuplicateError):
        add_watchlist(conn, "PYPL")
    assert remove_watchlist(conn, "PYPL") is True
    assert remove_watchlist(conn, "PYPL") is False
    assert "PYPL" not in list_watchlist(conn)


def test_duplicate_does_not_break_transaction(conn):
    with pytest.raises(DuplicateError):
        add_watchlist(conn, "AAPL")
    add_watchlist(conn, "PYPL")
    assert "PYPL" in list_watchlist(conn)


def test_snapshots_oldest_first(conn):
    assert list_snapshots(conn) == []
    insert_snapshot(conn, 10000.0)
    snap = insert_snapshot(conn, 10050.0)
    assert snap["recorded_at"].endswith("Z")
    assert [s["total_value"] for s in list_snapshots(conn)] == [10000.0, 10050.0]


def test_chat_messages_roundtrip(conn):
    actions = [{"type": "trade", "ticker": "NVDA", "status": "failed", "error": "x"}]
    insert_chat_message(conn, "user", "Buy 5 NVDA", None)
    insert_chat_message(conn, "assistant", "Done.", actions)
    msgs = list_chat_messages(conn)
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[0]["actions"] is None
    assert msgs[1]["actions"] == actions
    assert set(msgs[0]) == {"role", "content", "actions", "created_at"}


def test_chat_messages_empty_actions_list(conn):
    insert_chat_message(conn, "assistant", "ok", [])
    assert list_chat_messages(conn)[0]["actions"] == []


def test_chat_limit_returns_most_recent_oldest_first(conn):
    for i in range(5):
        insert_chat_message(conn, "user", f"m{i}", None)
    assert [m["content"] for m in list_chat_messages(conn, limit=3)] == ["m2", "m3", "m4"]
    assert len(list_chat_messages(conn)) == 5
