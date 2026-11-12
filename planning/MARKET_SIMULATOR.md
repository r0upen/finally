# Market Simulator

How FinAlly makes realistic-looking stock prices with no API key. This is the
default market data source. It plugs into the interface in `MARKET_INTERFACE.md`
as `SimulatorDataSource` and writes to the shared `PriceCache` every 500 ms.

Goals, from PLAN.md Section 6:

- Geometric Brownian motion (GBM) with drift and volatility per ticker
- Updates about every 500 ms
- Correlated moves (tech stocks move together)
- Occasional sudden 2-5% "events" for drama
- Realistic seed prices; any well-formed unknown ticker gets a random seed
  between $50 and $300
- In-process, no external dependencies (only `numpy`, already installed)

## 1. The Math

### 1.1 Geometric Brownian motion

GBM is the standard textbook model for stock prices. Returns are random and
normally distributed, so prices are lognormal: they never go negative, and a
$10 stock and a $1,000 stock move by similar *percentages*.

Exact update for one time step `dt` (no approximation error at any step size):

```
S_next = S * exp( (mu - sigma^2 / 2) * dt  +  sigma * sqrt(dt) * Z )
```

| Symbol | Meaning | Example |
|---|---|---|
| `S` | current price | 190.00 |
| `mu` | annual drift (expected return) | 0.05 = 5% per year |
| `sigma` | annual volatility | 0.25 = 25% per year |
| `dt` | step length in years | see below |
| `Z` | standard normal random draw, mean 0 and std 1 | correlated across tickers (1.2) |

The `- sigma^2 / 2` term corrects for the fact that the average of `exp()` of a
random variable is larger than `exp()` of its average. Without it, prices would
drift upward faster than `mu`.

**Time step.** One tick is 0.5 seconds of trading time. A trading year is
252 days x 6.5 hours:

```
dt = 0.5 / (252 * 6.5 * 3600) = 8.48e-8 years
```

With `sigma = 0.25`, one tick moves the price by about
`0.25 * sqrt(8.48e-8) = 0.0073%`, about 1.4 cents on a $190 stock. Over an hour
that adds up to about 0.6%. That matches real large-cap behavior. Prices change
by a cent or two on most ticks, which is enough to trigger the green/red flash.
`DT` is a module constant; raising it speeds the market up if a demo needs more
motion.

### 1.2 Correlated moves: a factor model

Real stocks don't move independently. On a bad day most stocks fall together,
and tech stocks fall together more. Each ticker's random draw `Z` is built from
shared and private parts:

```
Z_i = sqrt(BETA_MARKET) * M  +  sqrt(beta_sector) * S_sector  +  sqrt(1 - BETA_MARKET - beta_sector) * E_i
```

- `M`: one market-wide draw per tick, shared by every ticker
- `S_sector`: one draw per sector per tick, shared within the sector
- `E_i`: a private draw for each ticker
- All of `M`, `S`, `E` are independent standard normals

The weights' squares sum to 1, so each `Z_i` is still a standard normal. The
resulting correlation between two tickers is:

| Pair | Correlation |
|---|---|
| Same sector | `BETA_MARKET + beta_sector` (tech: 0.3 + 0.3 = 0.6) |
| Different sectors | `BETA_MARKET` = 0.3 |

**Why a factor model and not a correlation matrix with Cholesky
decomposition?** Cholesky is the general method: write out the full N x N
correlation matrix and factor it. It needs the matrix rebuilt and re-factored
every time a ticker is added or removed, and it fails if the hand-written matrix
is not positive-definite. The factor model gives the same "sectors move together"
behavior from two numbers per ticker, and adding a ticker needs no recomputation.
The trade-off is less control over individual pairs, which a demo does not need.

### 1.3 Random events

On each tick, each ticker has a small chance of a sudden jump:

```
if random() < EVENT_PROBABILITY:            # 0.001 per ticker per tick
    size = uniform(0.02, 0.05)               # 2% to 5%
    sign = +1 or -1 with equal chance
    S = S * (1 + sign * size)
```

With 10 tickers at 2 ticks/second, that is about one event every 50 seconds
somewhere on the watchlist. It is frequent enough to notice, rare enough to stay
special. Events apply after the GBM step and are not correlated across tickers.

## 2. Seed Prices and Parameters

```python
# seed_prices.py
DEFAULT_MU = 0.05
DEFAULT_SIGMA = 0.30
UNKNOWN_SEED_RANGE = (50.0, 300.0)

# ticker: (seed price, annual drift, annual volatility, sector)
TICKER_PARAMS: dict[str, tuple[float, float, float, str]] = {
    "AAPL":  (190.0, 0.05, 0.25, "tech"),
    "GOOGL": (175.0, 0.05, 0.28, "tech"),
    "MSFT":  (420.0, 0.05, 0.24, "tech"),
    "AMZN":  (185.0, 0.05, 0.30, "tech"),
    "NVDA":  (875.0, 0.08, 0.50, "tech"),
    "META":  (500.0, 0.05, 0.35, "tech"),
    "NFLX":  (650.0, 0.05, 0.38, "tech"),
    "TSLA":  (250.0, 0.05, 0.55, "auto"),
    "JPM":   (200.0, 0.04, 0.20, "finance"),
    "V":     (280.0, 0.04, 0.18, "finance"),
}

BETA_MARKET = 0.3
SECTOR_BETA: dict[str, float] = {"tech": 0.3, "finance": 0.2, "auto": 0.0, "other": 0.0}
```

- Volatilities are rough real-world levels: payment networks are calm, while
  TSLA and NVDA swing hard.
- TSLA is in its own sector, so it only shares the market factor. In practice it
  often trades apart from big tech.
- Unknown tickers get a uniform random seed in $50-$300, `DEFAULT_MU`,
  `DEFAULT_SIGMA`, and sector `"other"` (correlation 0.3 with everything).

## 3. Code Structure

Two layers, each with one job:

| Class | Job | Knows about |
|---|---|---|
| `GBMSimulator` | Pure math: holds prices, advances them one step | numpy only. No asyncio, no cache. |
| `SimulatorDataSource` | Runs the simulator every 500 ms and writes to `PriceCache` | asyncio, `PriceCache`, `MarketDataSource` |

Keeping the math free of asyncio means tests can call `step()` thousands of times
in milliseconds and check statistics directly. `SimulatorDataSource` is shown in
`MARKET_INTERFACE.md` Section 6.

### 3.1 `GBMSimulator`

```python
# simulator.py
import math
from dataclasses import dataclass

import numpy as np

from .seed_prices import (
    BETA_MARKET, DEFAULT_MU, DEFAULT_SIGMA, SECTOR_BETA, TICKER_PARAMS, UNKNOWN_SEED_RANGE,
)

DT = 0.5 / (252 * 6.5 * 3600)       # one 500 ms tick, in trading years
EVENT_PROBABILITY = 0.001           # per ticker per tick
EVENT_SIZE_RANGE = (0.02, 0.05)


@dataclass
class _TickerState:
    price: float          # full precision; rounding happens in PriceCache
    mu: float
    sigma: float
    sector: str


class GBMSimulator:
    def __init__(self, tickers: list[str], seed: int | None = None) -> None:
        self._rng = np.random.default_rng(seed)    # pass a seed for repeatable tests
        self._state: dict[str, _TickerState] = {}
        for ticker in tickers:
            self.add_ticker(ticker)

    # --- ticker management -------------------------------------------------

    def add_ticker(self, ticker: str) -> bool:
        """Add a ticker with its seed price. Returns False if already present."""
        if ticker in self._state:
            return False
        if ticker in TICKER_PARAMS:
            price, mu, sigma, sector = TICKER_PARAMS[ticker]
        else:
            price = float(self._rng.uniform(*UNKNOWN_SEED_RANGE))
            mu, sigma, sector = DEFAULT_MU, DEFAULT_SIGMA, "other"
        self._state[ticker] = _TickerState(price, mu, sigma, sector)
        return True

    def remove_ticker(self, ticker: str) -> None:
        self._state.pop(ticker, None)

    def tickers(self) -> list[str]:
        return list(self._state)

    def price(self, ticker: str) -> float:
        return self._state[ticker].price

    def prices(self) -> dict[str, float]:
        return {t: s.price for t, s in self._state.items()}

    # --- one tick ----------------------------------------------------------

    def step(self) -> dict[str, float]:
        """Advance every ticker by one tick and return the new prices."""
        market = self._rng.standard_normal()
        sectors = {s.sector for s in self._state.values()}
        sector_draws = {name: self._rng.standard_normal() for name in sectors}

        for state in self._state.values():
            z = self._correlated_draw(state.sector, market, sector_draws[state.sector])
            drift = (state.mu - 0.5 * state.sigma**2) * DT
            shock = state.sigma * math.sqrt(DT) * z
            state.price *= math.exp(drift + shock)

            if self._rng.random() < EVENT_PROBABILITY:
                size = self._rng.uniform(*EVENT_SIZE_RANGE)
                sign = 1 if self._rng.random() < 0.5 else -1
                state.price *= 1 + sign * size

        return self.prices()

    def _correlated_draw(self, sector: str, market: float, sector_draw: float) -> float:
        beta_sector = SECTOR_BETA.get(sector, 0.0)
        own = self._rng.standard_normal()
        return (
            math.sqrt(BETA_MARKET) * market
            + math.sqrt(beta_sector) * sector_draw
            + math.sqrt(1 - BETA_MARKET - beta_sector) * own
        )
```

Notes on choices in the code:

- **A plain loop, not vectorized numpy.** With 10 to 50 tickers, one step takes
  microseconds either way. The loop reads like the formula, which matters more
  here than speed.
- **Full-precision internal prices.** Rounding the internal state to cents every
  tick would add a small bias that compounds over time. Rounding happens only in
  `PriceCache.update`.
- **One `numpy.random.Generator`.** A fixed `seed` makes every test run produce
  the same price path.
- **Exact GBM step (`exp`)** instead of the simpler `S * (1 + mu*dt + sigma*sqrt(dt)*Z)`
  (Euler). The Euler version can go negative with a big enough draw, and it is
  slightly biased. The exact form costs the same.

### 3.2 Lifecycle

```
app startup
  -> create_market_data_source(cache)            # no MASSIVE_API_KEY -> simulator
  -> SimulatorDataSource.start(watchlist + held)
       -> GBMSimulator(tickers)                   # seed prices
       -> cache.update() for every ticker         # prices exist before first tick
       -> background task: every 0.5 s
            step() -> cache.update() per ticker
user adds PYPL to the watchlist
  -> add_ticker("PYPL")                           # random seed $50-$300, priced now
user removes PYPL (and does not hold it)
  -> remove_ticker("PYPL")                        # dropped from simulator and cache
app shutdown
  -> stop()                                       # cancel the task
```

Prices restart from seed values on every app restart. That's fine for a demo:
the portfolio stores `avg_cost`, not prices, so P&L simply reflects the new
simulated price.

## 4. Testing

Statistical tests use a fixed seed and many steps so they are fast and
deterministic. Temporarily set `EVENT_PROBABILITY` to 0 (via `monkeypatch`) when
checking the pure GBM statistics.

| Test | How |
|---|---|
| Seeds | Known tickers start at their table price; unknown tickers are in $50-$300. |
| Positivity | 100,000 steps: every price stays above 0. |
| Volatility | Std of one-tick log returns is close to `sigma * sqrt(DT)` (within ~5%). |
| Drift sanity | Mean log return is close to `(mu - sigma^2/2) * DT`. Use a large sample; the drift is tiny relative to noise. |
| Correlation | Over 20,000 steps, AAPL/MSFT log-return correlation is about 0.6, AAPL/JPM about 0.3, AAPL/TSLA about 0.3 (each within ~0.05). |
| Events | With `EVENT_PROBABILITY = 1`, every step moves each ticker by at least 2% (minus the tiny GBM part). |
| Add/remove | `add_ticker` returns False for duplicates; removed tickers vanish from `step()` output. |
| Determinism | Two simulators with the same seed produce identical paths. |

## 5. Tuning Knobs

All are module constants, so they are easy to find and change:

| Constant | Default | Effect of raising it |
|---|---|---|
| `DT` | one 500 ms tick of trading time | Faster, bigger moves per tick |
| `EVENT_PROBABILITY` | 0.001 | More frequent jumps |
| `EVENT_SIZE_RANGE` | (0.02, 0.05) | Bigger jumps |
| `BETA_MARKET` | 0.3 | Whole market moves more in lockstep |
| `SECTOR_BETA[...]` | 0.0-0.3 | Sector peers move more together (keep `BETA_MARKET + beta <= 1`) |
| per-ticker `sigma` | 0.18-0.55 | That ticker is more volatile |
