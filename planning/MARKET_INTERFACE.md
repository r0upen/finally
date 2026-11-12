# Market Data Interface

The unified Python API the backend uses to get stock prices. One interface, two
implementations:

- `MassiveDataSource` when `MASSIVE_API_KEY` is set and non-empty
- `SimulatorDataSource` otherwise (the default)

Everything downstream (SSE stream, trade execution, portfolio valuation, LLM
context) reads prices from a shared `PriceCache` and never knows which source is
running. API research: `MASSIVE_API.md`. Simulator design: `MARKET_SIMULATOR.md`.

## 1. Design in One Picture

```
                 create_market_data_source(cache)
                   |  MASSIVE_API_KEY set?
           yes ----+---- no
            |              |
   MassiveDataSource   SimulatorDataSource       (background asyncio task)
            \              /
             \  writes    /
              v          v
              +----------+
              |PriceCache|   latest PriceUpdate per ticker, version counter
              +----------+
               |    |    |
       SSE stream  trades  portfolio / LLM context    (readers)
```

Key decisions:

| Decision | Choice | Main alternative | Why |
|---|---|---|---|
| How readers get prices | Pull from an in-memory cache | Sources push to subscribers (callbacks/queues) | The cache decouples producer speed from consumers. A trade just reads the latest price, and SSE reads at its own cadence. |
| Source shape | Abstract base class (`abc.ABC`) | `typing.Protocol` | An ABC fails loudly at construction if a method is missing, which is easier to debug. |
| Concurrency | `asyncio` background task in the FastAPI process | A thread or separate process | Everything runs in one event loop, so the cache needs no locks. The sync Massive client is wrapped in `asyncio.to_thread`. |
| Who decides which tickers to track | The caller (watchlist/portfolio code) | The source reads the DB itself | The source stays free of database code, which keeps both easy to test. |

## 2. Module Layout

```
backend/app/market/
  __init__.py        public exports (below)
  models.py          PriceUpdate
  cache.py           PriceCache
  interface.py       MarketDataSource (abstract base class)
  seed_prices.py     default seed prices and per-ticker parameters
  simulator.py       GBMSimulator + SimulatorDataSource
  massive_client.py  MassiveDataSource
  factory.py         create_market_data_source()
  stream.py          GET /api/stream/prices (SSE router)
```

Public API (`app/market/__init__.py`):

```python
from .cache import PriceCache
from .factory import create_market_data_source
from .interface import MarketDataSource
from .models import PriceUpdate
from .stream import create_stream_router

__all__ = ["PriceCache", "PriceUpdate", "MarketDataSource",
           "create_market_data_source", "create_stream_router"]
```

## 3. Data Model: `PriceUpdate`

```python
# models.py
from dataclasses import dataclass


@dataclass(frozen=True)
class PriceUpdate:
    ticker: str
    price: float
    previous_price: float
    timestamp: float  # Unix seconds

    @property
    def change(self) -> float:
        return round(self.price - self.previous_price, 4)

    @property
    def direction(self) -> str:
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "change": self.change,
            "direction": self.direction,
            "timestamp": self.timestamp,
        }
```

Frozen means an update never changes after it is created, so it is safe to
hand the same object to many readers.

## 4. `PriceCache`

```python
# cache.py
import time

from .models import PriceUpdate


class PriceCache:
    """Latest price per ticker. Single writer (the data source), many readers."""

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._version = 0

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceUpdate:
        prev = self._prices.get(ticker)
        update = PriceUpdate(
            ticker=ticker,
            price=round(price, 2),
            previous_price=prev.price if prev else round(price, 2),
            timestamp=timestamp if timestamp is not None else time.time(),
        )
        self._prices[ticker] = update
        self._version += 1
        return update

    def get(self, ticker: str) -> PriceUpdate | None:
        return self._prices.get(ticker)

    def get_price(self, ticker: str) -> float | None:
        update = self._prices.get(ticker)
        return update.price if update else None

    def get_all(self) -> dict[str, PriceUpdate]:
        return dict(self._prices)

    def remove(self, ticker: str) -> None:
        if self._prices.pop(ticker, None) is not None:
            self._version += 1

    @property
    def version(self) -> int:
        """Bumps on every change. SSE uses it to skip sends when nothing changed."""
        return self._version
```

Rules:

- The first price for a ticker has `previous_price == price` (direction `flat`).
- Prices are rounded to 2 decimals at write time, so every reader sees the same value.
- No lock: all reads and writes happen on the event loop thread. If a writer
  ever moves to a thread, add a `threading.Lock` around the dict.

## 5. The Interface: `MarketDataSource`

```python
# interface.py
from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Produces prices for a set of tickers and writes them to a PriceCache."""

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing prices for `tickers`. Starts a background task. Call once."""

    @abstractmethod
    async def stop(self) -> None:
        """Cancel the background task. Safe to call more than once."""

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Start tracking a ticker. No-op if already tracked."""

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Stop tracking a ticker and drop it from the cache. No-op if not tracked."""

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Tickers currently tracked."""
```

Contract for both implementations:

- Tickers arrive already normalized (uppercase, `^[A-Z]{1,5}$`). Validation
  happens at the API boundary, not here.
- A ticker the source cannot price (for example, an invalid symbol on Massive)
  simply never appears in the cache. The source never invents a price.
- Errors inside the background loop are logged, and the loop keeps running. A
  failed poll must never kill price updates for the rest of the app.
- `add_ticker` should make a price available quickly. The simulator seeds one
  immediately; Massive prices it on the next poll.

## 6. Implementation: `SimulatorDataSource`

```python
# simulator.py (outline; the math is in MARKET_SIMULATOR.md)
import asyncio
import logging

from .cache import PriceCache
from .interface import MarketDataSource

log = logging.getLogger(__name__)


class SimulatorDataSource(MarketDataSource):
    def __init__(self, cache: PriceCache, update_interval: float = 0.5) -> None:
        self._cache = cache
        self._interval = update_interval
        self._sim: GBMSimulator | None = None
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._sim = GBMSimulator(tickers)
        for ticker, price in self._sim.prices().items():   # cache is never empty
            self._cache.update(ticker, price)
        self._task = asyncio.create_task(self._run(), name="simulator")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        if self._sim and self._sim.add_ticker(ticker):
            self._cache.update(ticker, self._sim.price(ticker))

    async def remove_ticker(self, ticker: str) -> None:
        if self._sim:
            self._sim.remove_ticker(ticker)
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return self._sim.tickers() if self._sim else []

    async def _run(self) -> None:
        while True:
            try:
                for ticker, price in self._sim.step().items():
                    self._cache.update(ticker, price)
            except Exception:
                log.exception("Simulator step failed")
            await asyncio.sleep(self._interval)
```

## 7. Implementation: `MassiveDataSource`

Behavior, based on `MASSIVE_API.md`:

- **Snapshot mode (paid plans).** Every `poll_interval` seconds, one call to
  `get_snapshot_all("stocks", tickers=[...all tracked...])`. Price is
  `last_trade.price`, falling back to `min.close`, `day.close`, then `prev_day.close`.
- **EOD mode (free plan).** If the first snapshot call is rejected as not
  authorized, log a warning and switch permanently to EOD mode. Fetch grouped
  daily bars for the last trading day (one call covers every ticker), keep all
  closes in memory, and refresh them hourly. Each poll writes the stored close
  for each tracked ticker. Prices do not move in this mode.
- Default `poll_interval` is 15 s, which keeps the free plan at 4 calls/min. Paid
  plans can pass 2 to 5 s.

```python
# massive_client.py
import asyncio
import logging
import time
from datetime import date, timedelta

from massive import RESTClient
from massive.exceptions import BadResponse

from .cache import PriceCache
from .interface import MarketDataSource

log = logging.getLogger(__name__)

EOD_REFRESH_SECONDS = 3600


def snapshot_price(snap) -> float | None:
    """Best available price from a TickerSnapshot, or None."""
    if snap.last_trade and snap.last_trade.price:
        return snap.last_trade.price
    for bar in (snap.min, snap.day, snap.prev_day):
        if bar and bar.close:
            return bar.close
    return None


class MassiveDataSource(MarketDataSource):
    def __init__(self, cache: PriceCache, api_key: str, poll_interval: float = 15.0) -> None:
        self._cache = cache
        self._client = RESTClient(api_key=api_key)
        self._interval = poll_interval
        self._tickers: set[str] = set()
        self._task: asyncio.Task | None = None
        self._eod_mode = False
        self._eod_closes: dict[str, tuple[float, float]] = {}  # ticker -> (close, ts)
        self._eod_fetched_at = 0.0

    async def start(self, tickers: list[str]) -> None:
        self._tickers = set(tickers)
        await self._poll_once()                     # prices before the first SSE client
        self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def add_ticker(self, ticker: str) -> None:
        self._tickers.add(ticker)                   # priced on the next poll

    async def remove_ticker(self, ticker: str) -> None:
        self._tickers.discard(ticker)
        self._cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self._tickers)

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            await self._poll_once()

    async def _poll_once(self) -> None:
        if not self._tickers:
            return
        try:
            if self._eod_mode:
                await self._poll_eod()
            else:
                await self._poll_snapshot()
        except Exception:
            log.exception("Massive poll failed; will retry next interval")

    async def _poll_snapshot(self) -> None:
        try:
            snaps = await asyncio.to_thread(
                self._client.get_snapshot_all, "stocks", tickers=sorted(self._tickers)
            )
        except BadResponse as exc:
            if "NOT_AUTHORIZED" in str(exc) or "403" in str(exc):
                log.warning("Plan has no snapshot access; using end-of-day prices")
                self._eod_mode = True
                await self._poll_eod()
                return
            raise
        for snap in snaps:
            price = snapshot_price(snap)
            if snap.ticker in self._tickers and price:
                ts = snap.updated / 1e9 if snap.updated else time.time()  # ns -> s
                self._cache.update(snap.ticker, price, ts)

    async def _poll_eod(self) -> None:
        if time.time() - self._eod_fetched_at > EOD_REFRESH_SECONDS:
            self._eod_closes = await asyncio.to_thread(self._fetch_last_trading_day)
            self._eod_fetched_at = time.time()
        for ticker in self._tickers:
            if ticker in self._eod_closes:
                close, ts = self._eod_closes[ticker]
                self._cache.update(ticker, close, ts)

    def _fetch_last_trading_day(self) -> dict[str, tuple[float, float]]:
        day = date.today() - timedelta(days=1)
        for _ in range(5):                          # weekends + holiday
            bars = self._client.get_grouped_daily_aggs(day.isoformat(), adjusted=True)
            if bars:
                return {b.ticker: (b.close, b.timestamp / 1000) for b in bars if b.close}
            day -= timedelta(days=1)
        return {}
```

Notes:

- `date.today()` uses the server's clock. The free plan publishes a day's bars
  after midnight ET, so the walk-back loop also covers "yesterday not ready yet".
- The `"NOT_AUTHORIZED"` string check must be confirmed with a real free-plan key
  (see `MASSIVE_API.md` Section 5.5).
- A newly added ticker gets its first price within one `poll_interval`.

## 8. Factory

```python
# factory.py
import logging
import os

from .cache import PriceCache
from .interface import MarketDataSource
from .massive_client import MassiveDataSource
from .simulator import SimulatorDataSource

log = logging.getLogger(__name__)


def create_market_data_source(cache: PriceCache) -> MarketDataSource:
    api_key = os.getenv("MASSIVE_API_KEY", "").strip()
    if api_key:
        log.info("Market data: Massive API")
        return MassiveDataSource(cache, api_key=api_key)
    log.info("Market data: simulator")
    return SimulatorDataSource(cache)
```

Whitespace-only keys count as unset, matching PLAN.md ("absent or empty").

## 9. Wiring It Into FastAPI

```python
# app/main.py (excerpt)
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import PriceCache, create_market_data_source, create_stream_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()                                        # database module
    cache = PriceCache()
    source = create_market_data_source(cache)
    await source.start(load_tracked_tickers())       # watchlist UNION open positions
    app.state.price_cache = cache
    app.state.market_source = source
    yield
    await source.stop()


app = FastAPI(lifespan=lifespan)
app.include_router(create_stream_router(lambda: app.state.price_cache))
# ... other /api routers, then the static mount at "/" last
```

### Keeping the tracked set correct

PLAN.md says the tracked set is the union of watchlist tickers and open
positions. The source only offers `add_ticker` and `remove_ticker`, so the
watchlist and trade code call one helper after any change:

```python
async def sync_tracked(source: MarketDataSource, ticker: str) -> None:
    """Track `ticker` if it is on the watchlist or held; otherwise stop tracking it."""
    if on_watchlist(ticker) or has_position(ticker):
        await source.add_ticker(ticker)
    else:
        await source.remove_ticker(ticker)
```

Call it after: adding to the watchlist, removing from the watchlist, and any
trade that opens or closes a position.

### Reading prices elsewhere

```python
price = request.app.state.price_cache.get_price("AAPL")
if price is None:
    raise HTTPException(400, "No price available for AAPL")
```

## 10. SSE Stream

```python
# stream.py
import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse


def create_stream_router(get_cache) -> APIRouter:
    router = APIRouter()

    @router.get("/api/stream/prices")
    async def stream_prices(request: Request):
        async def events():
            yield "retry: 1000\n\n"                  # browser reconnect delay (ms)
            last_version = -1
            while not await request.is_disconnected():
                cache = get_cache()
                if cache.version != last_version:
                    last_version = cache.version
                    payload = {t: u.to_dict() for t, u in cache.get_all().items()}
                    yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.5)

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
```

Wire format (the frontend contract): each SSE message is one JSON object keyed by
ticker, and each value has every field from `PriceUpdate.to_dict()`:

```
data: {"AAPL": {"ticker": "AAPL", "price": 190.42, "previous_price": 190.38,
                "change": 0.04, "direction": "up", "timestamp": 1731420000.5}, ...}
```

Sending all tickers in one message per tick keeps the frontend simple: one
`onmessage` handler loops over the object. A removed ticker stops appearing.

## 11. Testing

- `PriceCache`: first update is flat; direction up/down; rounding; `remove` bumps
  `version`.
- `SimulatorDataSource`: after `start`, every ticker has a price; `add_ticker`
  prices immediately; `remove_ticker` clears the cache entry.
- `MassiveDataSource`: replace `_client` with a fake object.
  - Snapshot mode: correct fallback order in `snapshot_price`; ns-to-seconds
    conversion; unknown tickers are skipped.
  - A `BadResponse("...NOT_AUTHORIZED...")` switches to EOD mode, and grouped
    daily closes land in the cache.
  - The walk-back skips empty days.
  - Any other exception is logged and the loop keeps running.
- Factory: empty, whitespace-only, and real key values choose the right class
  (use `monkeypatch.setenv`).
- Both sources pass the same small contract test (start, add, remove, stop),
  parametrized over the two classes.
