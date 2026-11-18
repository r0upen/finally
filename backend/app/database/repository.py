"""Data access functions. Each takes an open connection; the caller's
get_connection() block owns the transaction (no commits here)."""

import json
import sqlite3

from .connection import new_id, utc_now_iso

ZERO_QTY = 1e-9


class DuplicateError(Exception):
    """Raised when inserting a row that already exists (e.g. watchlist ticker)."""


def is_zero_qty(quantity: float) -> bool:
    return abs(quantity) < ZERO_QTY


# --- cash ---

def get_cash(conn: sqlite3.Connection, *, user_id: str = "default") -> float:
    row = conn.execute("SELECT cash_balance FROM users_profile WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise LookupError(f"No user profile for {user_id!r}")
    return float(row["cash_balance"])


def set_cash(conn: sqlite3.Connection, amount: float, *, user_id: str = "default") -> None:
    conn.execute("UPDATE users_profile SET cash_balance = ? WHERE id = ?", (amount, user_id))


# --- positions ---

_POSITION_COLS = "ticker, quantity, avg_cost, updated_at"


def get_positions(conn: sqlite3.Connection, *, user_id: str = "default") -> list[dict]:
    rows = conn.execute(
        f"SELECT {_POSITION_COLS} FROM positions WHERE user_id = ? ORDER BY ticker", (user_id,)
    )
    return [dict(r) for r in rows]


def get_position(conn: sqlite3.Connection, ticker: str, *, user_id: str = "default") -> dict | None:
    row = conn.execute(
        f"SELECT {_POSITION_COLS} FROM positions WHERE user_id = ? AND ticker = ?",
        (user_id, ticker),
    ).fetchone()
    return dict(row) if row else None


def upsert_position(
    conn: sqlite3.Connection, ticker: str, quantity: float, avg_cost: float,
    *, user_id: str = "default",
) -> None:
    conn.execute(
        """INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, ticker) DO UPDATE SET
             quantity = excluded.quantity, avg_cost = excluded.avg_cost,
             updated_at = excluded.updated_at""",
        (new_id(), user_id, ticker, quantity, avg_cost, utc_now_iso()),
    )


def delete_position(conn: sqlite3.Connection, ticker: str, *, user_id: str = "default") -> bool:
    cur = conn.execute("DELETE FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker))
    return cur.rowcount > 0


# --- trades ---

def insert_trade(
    conn: sqlite3.Connection, ticker: str, side: str, quantity: float, price: float,
    *, user_id: str = "default",
) -> dict:
    trade = {"id": new_id(), "ticker": ticker, "side": side, "quantity": quantity,
             "price": price, "executed_at": utc_now_iso()}
    conn.execute(
        """INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at)
           VALUES (:id, :user_id, :ticker, :side, :quantity, :price, :executed_at)""",
        {**trade, "user_id": user_id},
    )
    return trade


# --- watchlist ---

def list_watchlist(conn: sqlite3.Connection, *, user_id: str = "default") -> list[str]:
    rows = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid", (user_id,)
    )
    return [r["ticker"] for r in rows]


def add_watchlist(conn: sqlite3.Connection, ticker: str, *, user_id: str = "default") -> None:
    try:
        conn.execute(
            "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, ticker, utc_now_iso()),
        )
    except sqlite3.IntegrityError as exc:
        raise DuplicateError(f"{ticker} is already on the watchlist") from exc


def remove_watchlist(conn: sqlite3.Connection, ticker: str, *, user_id: str = "default") -> bool:
    cur = conn.execute("DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (user_id, ticker))
    return cur.rowcount > 0


# --- portfolio snapshots ---

def insert_snapshot(conn: sqlite3.Connection, total_value: float, *, user_id: str = "default") -> dict:
    snap = {"total_value": total_value, "recorded_at": utc_now_iso()}
    conn.execute(
        "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
        (new_id(), user_id, total_value, snap["recorded_at"]),
    )
    return snap


def list_snapshots(conn: sqlite3.Connection, *, user_id: str = "default") -> list[dict]:
    rows = conn.execute(
        """SELECT total_value, recorded_at FROM portfolio_snapshots
           WHERE user_id = ? ORDER BY recorded_at, rowid""",
        (user_id,),
    )
    return [dict(r) for r in rows]


# --- chat ---

def insert_chat_message(
    conn: sqlite3.Connection, role: str, content: str, actions: list | None,
    *, user_id: str = "default",
) -> dict:
    msg = {"role": role, "content": content, "actions": actions, "created_at": utc_now_iso()}
    conn.execute(
        """INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (new_id(), user_id, role, content,
         None if actions is None else json.dumps(actions), msg["created_at"]),
    )
    return msg


def list_chat_messages(
    conn: sqlite3.Connection, limit: int | None = None, *, user_id: str = "default",
) -> list[dict]:
    """Oldest first. With limit, returns the most recent `limit` messages."""
    rows = conn.execute(
        """SELECT role, content, actions, created_at FROM chat_messages
           WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?""",
        (user_id, -1 if limit is None else limit),
    ).fetchall()
    out = []
    for r in reversed(rows):
        msg = dict(r)
        msg["actions"] = None if msg["actions"] is None else json.loads(msg["actions"])
        out.append(msg)
    return out
