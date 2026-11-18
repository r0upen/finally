"""Process-wide price cache and market data source, plus tracked-ticker rules.

Tracked tickers = watchlist tickers UNION tickers with an open position.
"""

import logging
import re
import sqlite3

from app.database import get_connection, get_positions, list_watchlist
from app.market import MarketDataSource, PriceCache, create_market_data_source

logger = logging.getLogger(__name__)

TICKER_RE = re.compile(r"^[A-Z]{1,5}$")

price_cache = PriceCache()
_source: MarketDataSource | None = None


def normalize_ticker(ticker: str) -> str | None:
    """Uppercase and strip; return None if not 1-5 letters."""
    t = (ticker or "").strip().upper()
    return t if TICKER_RE.match(t) else None


def tracked_tickers(conn: sqlite3.Connection) -> list[str]:
    """Union of watchlist and held tickers, watchlist order first."""
    tickers = list_watchlist(conn)
    for p in get_positions(conn):
        if p["ticker"] not in tickers:
            tickers.append(p["ticker"])
    return tickers


async def start() -> None:
    """Start the market data source for all currently tracked tickers."""
    global _source
    with get_connection() as conn:
        tickers = tracked_tickers(conn)
    _source = create_market_data_source(price_cache)
    await _source.start(tickers)
    logger.info("Market data started for %d tickers", len(tickers))


async def stop() -> None:
    global _source
    if _source is not None:
        await _source.stop()
        _source = None


async def track(ticker: str) -> None:
    """Start tracking a ticker (no-op if already tracked)."""
    if _source is not None:
        await _source.add_ticker(ticker)


async def untrack_if_unused(ticker: str) -> None:
    """Stop tracking a ticker unless it is on the watchlist or held."""
    with get_connection() as conn:
        still_needed = ticker in tracked_tickers(conn)
    if not still_needed and _source is not None:
        await _source.remove_ticker(ticker)
