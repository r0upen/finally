# Database Interface (backend/app/database)

Stdlib `sqlite3`, synchronous. Import everything from `app.database`.

```python
from app.database import (
    resolve_db_path, init_db, get_connection,
    DuplicateError, ZERO_QTY, is_zero_qty, utc_now_iso,
    get_cash, set_cash,
    get_positions, get_position, upsert_position, delete_position,
    insert_trade,
    list_watchlist, add_watchlist, remove_watchlist,
    insert_snapshot, list_snapshots,
    insert_chat_message, list_chat_messages,
)
```

## Setup

- `resolve_db_path() -> Path` - `DB_PATH` env var if set and non-empty, else `<project root>/db/finally.db` (resolved from the code location, not cwd).
- `init_db(path: Path | None = None) -> None` - creates the parent directory, all tables (PLAN Section 7), and seeds the default user ($10,000) and 10 default watchlist tickers only when empty. Idempotent. Call once in the FastAPI lifespan.
- `get_connection(path: Path | None = None)` - context manager yielding a `sqlite3.Connection` (`row_factory=sqlite3.Row`, foreign keys on). The whole `with` block is ONE transaction (`BEGIN IMMEDIATE`): commits on success, rolls back on any exception. Use one block for the whole trade flow (read cash, update cash, upsert/delete position, insert trade, insert snapshot).

```python
with get_connection() as conn:
    cash = get_cash(conn)
    set_cash(conn, cash - cost)
    upsert_position(conn, "AAPL", 10, 190.0)
    trade = insert_trade(conn, "AAPL", "buy", 10, 190.0)
    insert_snapshot(conn, total_value)
# raising inside the block rolls everything back
```

## Helpers

- `ZERO_QTY = 1e-9`; `is_zero_qty(q: float) -> bool` is `abs(q) < ZERO_QTY`.
- `utc_now_iso() -> str` - e.g. `"2026-11-10T14:00:00Z"`.
- `DuplicateError(Exception)` - raised by `add_watchlist` when the ticker is already present.

## Repository functions

All take `conn` first and `user_id: str = "default"` as a keyword. They do not commit; the context manager does. Tickers are stored as given; callers normalize to uppercase.

| Function | Returns |
|---|---|
| `get_cash(conn)` | `float` |
| `set_cash(conn, amount: float)` | `None` |
| `get_positions(conn)` | `list[dict]` `{ticker, quantity, avg_cost, updated_at}`, ordered by ticker |
| `get_position(conn, ticker)` | `dict` (same keys) or `None` |
| `upsert_position(conn, ticker, quantity, avg_cost)` | `None` (insert or update) |
| `delete_position(conn, ticker)` | `bool` (True if a row was deleted) |
| `insert_trade(conn, ticker, side, quantity, price)` | `dict` `{id, ticker, side, quantity, price, executed_at}` |
| `list_watchlist(conn)` | `list[str]` in added order |
| `add_watchlist(conn, ticker)` | `None`; raises `DuplicateError` if present |
| `remove_watchlist(conn, ticker)` | `bool` (False if not present) |
| `insert_snapshot(conn, total_value: float)` | `dict` `{total_value, recorded_at}` |
| `list_snapshots(conn)` | `list[dict]` `{total_value, recorded_at}`, oldest first |
| `insert_chat_message(conn, role, content, actions: list \| None)` | `dict` `{role, content, actions, created_at}` |
| `list_chat_messages(conn, limit: int \| None = None)` | `list[dict]` same keys, oldest first; with `limit`, the most recent N (still oldest first). `actions` decoded to list or `None` |

`upsert_position` does not delete on zero quantity; callers check `is_zero_qty` and call `delete_position`.
