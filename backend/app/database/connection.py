"""DB path resolution, initialization, and transactional connections."""

import os
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from .schema import DEFAULT_CASH, DEFAULT_TICKERS, DEFAULT_USER_ID, SCHEMA_SQL

# backend/app/database/connection.py -> parents[3] is the project root
PROJECT_ROOT = Path(__file__).resolve().parents[3]


def utc_now_iso() -> str:
    """Current UTC time as ISO 8601 with a 'Z' suffix."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id() -> str:
    return str(uuid.uuid4())


def resolve_db_path() -> Path:
    """DB_PATH env var if set, else <project root>/db/finally.db."""
    env = os.environ.get("DB_PATH", "").strip()
    return Path(env) if env else PROJECT_ROOT / "db" / "finally.db"


@contextmanager
def get_connection(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yield a connection whose whole with-block is one transaction.

    BEGIN IMMEDIATE takes the write lock up front, so read-then-write flows
    (e.g. check cash, then debit it) cannot interleave with another writer.
    """
    conn = sqlite3.connect(path or resolve_db_path(), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def init_db(path: Path | None = None) -> None:
    """Create tables and seed defaults if empty. Safe to call repeatedly."""
    path = path or resolve_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # executescript manages its own commits, so run it outside get_connection
    setup = sqlite3.connect(path)
    try:
        setup.executescript(SCHEMA_SQL)
    finally:
        setup.close()

    with get_connection(path) as conn:
        now = utc_now_iso()
        # Seed only a fresh DB (no user yet); a user who emptied their
        # watchlist must not get the defaults back on restart.
        if conn.execute("SELECT COUNT(*) FROM users_profile").fetchone()[0] == 0:
            conn.execute(
                "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
                (DEFAULT_USER_ID, DEFAULT_CASH, now),
            )
            conn.executemany(
                "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                [(new_id(), DEFAULT_USER_ID, t, now) for t in DEFAULT_TICKERS],
            )
