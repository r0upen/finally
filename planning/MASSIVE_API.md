# Massive API Reference (formerly Polygon.io)

Research notes for retrieving real-time and end-of-day (EOD) stock prices for
multiple tickers. Researched 2026-11-12 against the official docs at
`massive.com/docs` and the official Python client `massive-com/client-python`.

## 1. Background

- Polygon.io rebranded as **Massive** on 2025-10-30. Existing API keys keep working.
- REST base URL: `https://api.massive.com`. The old `https://api.polygon.io` still
  works "for an extended period", but new code should use the new host.
- Auth: pass the key as the `apiKey` query parameter, or as an
  `Authorization: Bearer <key>` header. The Python client handles this.
- Endpoint paths are unchanged from Polygon (`/v2/...`, `/v3/...`).

## 2. Plans and What They Unlock

This table drives the design. **The free plan has no intraday data.**

| Plan | Price data recency | Rate limit | Snapshot endpoints | Last Trade |
|---|---|---|---|---|
| Stocks Basic (free) | End-of-day only | 5 calls/min | Not included | Not included |
| Stocks Starter | 15-min delayed | No limit | Included | Not included |
| Stocks Developer | 15-min delayed | No limit | Included | Included |
| Stocks Advanced | Real-time | No limit | Included | Included |
| Stocks Business | Real-time | No limit | Included | Expansion add-on |

Rate limits are per asset class: a paid Options plan does not lift the 5
calls/min limit on stock requests.

Consequences:

- On the free plan, requesting a snapshot returns **HTTP 403** (not authorized).
  The only usable price endpoints are the daily bar endpoints (Section 4).
- On the free plan, a trading day's bars become available **after midnight ET**.
  Requesting the current day returns 403.
- Going over 5 calls/min on the free plan returns **HTTP 429**.
- "Real-time" means a paid plan (Advanced or Business). Starter and Developer
  are 15 minutes behind.

## 3. Real-Time Prices: Snapshot Endpoints (paid plans)

### 3.1 Full Market Snapshot (recommended: many tickers, one call)

```
GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT,TSLA
```

| Param | Type | Notes |
|---|---|---|
| `tickers` | comma-separated string | Case-sensitive. Omit to get the whole market (10,000+ tickers, large). |
| `include_otc` | bool | Default `false`. |

Response (trimmed; values illustrative):

```json
{
  "status": "OK",
  "count": 1,
  "tickers": [
    {
      "ticker": "AAPL",
      "todaysChange": 1.23,
      "todaysChangePerc": 0.65,
      "updated": 1731420000000000000,
      "day":     {"o": 189.1, "h": 191.0, "l": 188.7, "c": 190.4, "v": 41250000, "vw": 190.0},
      "prevDay": {"o": 187.9, "h": 189.5, "l": 187.2, "c": 189.2, "v": 52000000, "vw": 188.6},
      "min":     {"o": 190.3, "h": 190.5, "l": 190.2, "c": 190.4, "v": 120000, "vw": 190.4,
                  "av": 41250000, "n": 812, "t": 1731419940000},
      "lastTrade": {"p": 190.41, "s": 100, "t": 1731419999123000000, "x": 4},
      "lastQuote": {"p": 190.40, "s": 2, "P": 190.42, "S": 3, "t": 1731419999456000000}
    }
  ]
}
```

Field meanings:

| Key | Meaning |
|---|---|
| `day`, `prevDay`, `min` | Daily, previous-day and latest-minute bars: `o` open, `h` high, `l` low, `c` close, `v` volume, `vw` VWAP |
| `min.av` | Accumulated volume for the day; `min.n` trade count; `min.t` bar time in **milliseconds** |
| `lastTrade` | `p` price, `s` size, `x` exchange id, `t` SIP time in **nanoseconds**. Only returned if the plan includes trades. |
| `lastQuote` | `p`/`s` bid price/size, `P`/`S` ask price/size, `t` in nanoseconds. Only if the plan includes quotes. |
| `updated` | Last update time, **nanoseconds** since epoch |
| `todaysChange`, `todaysChangePerc` | Change vs previous close |

Notes:

- Snapshot data is cleared at about **3:30 AM ET** daily and refills from about
  4:00 AM ET as exchanges report. Before that, `day` can be empty (zeros).
- An unknown symbol in `tickers` is simply absent from the response. No error.
- Picking "the current price" from a snapshot, best to worst:
  `lastTrade.p` (if present) -> `min.c` -> `day.c` -> `prevDay.c`.
  Skip zero values: `day.c` is 0 right after the daily reset.

### 3.2 Other snapshot and trade endpoints

| Endpoint | Use | Notes |
|---|---|---|
| `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}` | One ticker | Same fields as above; costs one call per ticker. |
| `GET /v3/snapshot?ticker.any_of=AAPL,MSFT` | Mixed asset classes | Max 250 tickers; paginated via `next_url`; snake_case fields (`session`, `last_trade`). |
| `GET /v2/last/trade/{ticker}` | Latest trade, one ticker | Developer plan and above. `results.p` price, `results.t` ns. |

For this project the full market snapshot with a `tickers` filter is the right
choice: one request covers the whole watchlist.

## 4. End-of-Day Prices (all plans, including free)

### 4.1 Daily Market Summary (grouped daily: all tickers, one call)

```
GET /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true
```

`{date}` is `YYYY-MM-DD`. It returns one daily bar for **every** US stock on that
date. There is no ticker filter, so you filter locally.

```json
{
  "status": "OK",
  "adjusted": true,
  "queryCount": 11500,
  "resultsCount": 11500,
  "results": [
    {"T": "AAPL", "o": 189.1, "h": 191.0, "l": 188.7, "c": 190.4,
     "v": 41250000, "vw": 190.0, "n": 512340, "t": 1731441600000}
  ]
}
```

`T` ticker, `c` close, `t` end of the bar window in **milliseconds**.
Weekends and holidays return `resultsCount: 0` (empty `results`).

This is the best EOD endpoint on the free plan: one call prices any number of
tickers, which fits the 5 calls/min limit.

### 4.2 Previous Day Bar (one ticker)

```
GET /v2/aggs/ticker/{ticker}/prev?adjusted=true
```

Returns the previous trading day's bar in `results[0]` (same short keys). It
costs one call per ticker, so with 10 tickers on the free plan it takes two
minutes. Use it only for a single ad-hoc lookup.

### 4.3 Daily Ticker Summary (one ticker, one date)

```
GET /v1/open-close/{ticker}/{date}
```

Returns `open`, `close`, `high`, `low`, `preMarket`, `afterHours` for one day.
This is useful for historical lookups and not needed for this project.

## 5. Python Client

Install into the backend project (already a dependency in `backend/pyproject.toml`):

```bash
cd backend && uv add massive
```

Requires Python 3.10+. Facts from the client source:

- `RESTClient()` reads `MASSIVE_API_KEY` from the environment if `api_key` is not
  passed. If neither is set it raises `AuthError`.
- Defaults: base `https://api.massive.com`, `connect_timeout=10.0`,
  `read_timeout=10.0`, `retries=3`. Retries cover 413, 429, 499 and 500-504, with a
  0.1 s backoff factor.
- Any non-200 response raises `massive.exceptions.BadResponse(body_text)`. There is
  no status-code attribute; the message is the raw JSON body.
- The client is **synchronous** (urllib3). In async code call it via
  `asyncio.to_thread(...)` so it does not block the event loop.
- Responses become dataclasses with readable names: `last_trade.price`,
  `prev_day.close`, `min.close`, `todays_change_percent`.

### 5.1 Real-time prices for several tickers (paid plan)

```python
from massive import RESTClient

client = RESTClient()  # reads MASSIVE_API_KEY

snapshots = client.get_snapshot_all("stocks", tickers=["AAPL", "MSFT", "TSLA"])

for snap in snapshots:
    price = None
    if snap.last_trade and snap.last_trade.price:
        price = snap.last_trade.price
    elif snap.min and snap.min.close:
        price = snap.min.close
    elif snap.day and snap.day.close:
        price = snap.day.close
    elif snap.prev_day and snap.prev_day.close:
        price = snap.prev_day.close
    print(snap.ticker, price, snap.todays_change_percent, snap.updated)
```

`get_snapshot_all(market_type, tickers=None, include_otc=False)` returns
`list[TickerSnapshot]`. `TickerSnapshot` fields: `ticker`, `day`, `prev_day`,
`min`, `last_trade`, `last_quote`, `todays_change`, `todays_change_percent`,
`updated`.

### 5.2 End-of-day prices for several tickers (any plan)

```python
from datetime import date, timedelta
from massive import RESTClient

client = RESTClient()
wanted = {"AAPL", "MSFT", "TSLA"}

# Walk back from yesterday until a trading day with data (skips weekends/holidays).
day = date.today() - timedelta(days=1)
for _ in range(7):
    bars = client.get_grouped_daily_aggs(day.isoformat(), adjusted=True)
    if bars:
        break
    day -= timedelta(days=1)

closes = {b.ticker: b.close for b in bars if b.ticker in wanted}
print(day, closes)
```

`get_grouped_daily_aggs(date, adjusted=None, include_otc=False)` returns
`list[GroupedDailyAgg]` with `ticker`, `open`, `high`, `low`, `close`, `volume`,
`vwap`, `timestamp`, `transactions`.

On the free plan each empty day in the loop costs one call. A long weekend uses
3 to 4 of the 5 calls per minute.

### 5.3 Single ticker helpers

```python
prev = client.get_previous_close_agg("AAPL")       # list of PreviousCloseAgg
print(prev[0].close)

snap = client.get_snapshot_ticker("stocks", "AAPL")  # paid plan
print(snap.last_trade.price if snap.last_trade else snap.day.close)
```

### 5.4 Using it from async code

```python
import asyncio
from massive import RESTClient

client = RESTClient()

async def fetch(tickers: list[str]):
    return await asyncio.to_thread(client.get_snapshot_all, "stocks", tickers=tickers)
```

### 5.5 Error handling

```python
from massive.exceptions import BadResponse

try:
    snaps = client.get_snapshot_all("stocks", tickers=["AAPL"])
except BadResponse as exc:
    body = str(exc)
    if "NOT_AUTHORIZED" in body:   # plan does not include snapshots (free plan)
        ...
    else:
        ...                        # 429, 5xx after retries, etc.
```

The 403 body is expected to contain `"status":"NOT_AUTHORIZED"`. Confirm this
with a real free-plan key before relying on the exact string. A substring check
on `"403"` or `"NOT_AUTHORIZED"` should be treated as "snapshots unavailable".

## 6. Plain HTTP (no client library)

Useful for quick checks with `curl` from the terminal:

```bash
# Real-time / delayed snapshot (paid plan)
curl "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,MSFT&apiKey=$MASSIVE_API_KEY"

# EOD grouped daily (any plan)
curl "https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/2026-11-11?adjusted=true&apiKey=$MASSIVE_API_KEY"
```

## 7. Recommendations for FinAlly

1. **Paid plan:** poll the full market snapshot with `tickers=<all tracked>` once
   per interval (default 15 s, configurable down to about 2 s). One call per poll.
2. **Free plan:** snapshots return 403. Fall back to grouped daily: one call
   prices every ticker for the last trading day. Prices then stay constant for
   the day, so the UI shows no price movement. The simulator is the better
   default for demos, which matches PLAN.md.
3. Treat a ticker missing from the response as "no price yet". Never invent one.
4. Convert timestamps: snapshot `updated` and `lastTrade.t` are nanoseconds; bar
   `t` is milliseconds.
5. Call the sync client through `asyncio.to_thread`.

## Sources

- Full Market Snapshot: https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot
- Single Ticker Snapshot: https://massive.com/docs/rest/stocks/snapshots/single-ticker-snapshot.md
- Unified Snapshot: https://massive.com/docs/rest/stocks/snapshots/unified-snapshot.md
- Last Trade: https://massive.com/docs/rest/stocks/trades-quotes/last-trade.md
- Daily Market Summary: https://massive.com/docs/rest/stocks/aggregates/daily-market-summary
- Previous Day Bar: https://massive.com/docs/rest/stocks/aggregates/previous-day-bar.md
- Docs index: https://massive.com/docs/rest/stocks/llms.txt
- Free plan timing: https://massive.com/knowledge-base/article/on-the-free-basic-plan-when-can-i-pull-the-previous-trading-days-data
- Pricing: https://massive.com/pricing
- Request limits: https://massive.com/knowledge-base/article/what-is-the-request-limit-for-massives-restful-apis
- Python client: https://github.com/massive-com/client-python
