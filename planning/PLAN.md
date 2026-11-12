# FinAlly — AI Trading Workstation

## Project Specification

## 1. Vision

FinAlly (Finance Ally) is a visually stunning AI-powered trading workstation that streams live market data, lets users trade a simulated portfolio, and integrates an LLM chat assistant that can analyze positions and execute trades on the user's behalf. It looks and feels like a modern Bloomberg terminal with an AI copilot.

This is the capstone project for an agentic AI coding course. It is built entirely by Coding Agents demonstrating how orchestrated AI agents can produce a production-quality full-stack application. Agents interact through files in `planning/`.

## 2. User Experience

### First Launch

The user runs a single Docker command (or a provided start script). A browser opens to `http://localhost:8000`. No login, no signup. They immediately see:

- A watchlist of 10 default tickers with live-updating prices in a grid
- $10,000 in virtual cash
- A dark, data-rich trading terminal aesthetic
- An AI chat panel ready to assist

### What the User Can Do

- **Watch prices stream** — prices flash green (uptick) or red (downtick) with subtle CSS animations that fade
- **View sparkline mini-charts** — price action beside each ticker in the watchlist, accumulated on the frontend from the SSE stream since page load (sparklines fill in progressively)
- **Click a ticker** to see a larger detailed chart in the main chart area
- **Buy and sell shares** — market orders only, instant fill at current price, no fees, no confirmation dialog
- **Monitor their portfolio** — a heatmap (treemap) showing positions sized by weight and colored by P&L, plus a P&L chart tracking total portfolio value over time
- **View a positions table** — ticker, quantity, average cost, current price, unrealized P&L, % change
- **Chat with the AI assistant** — ask about their portfolio, get analysis, and have the AI execute trades and manage the watchlist through natural language
- **Manage the watchlist** — add/remove tickers manually or via the AI chat

### Visual Design

- **Dark theme**: backgrounds around `#0d1117` or `#1a1a2e`, muted gray borders, no pure black
- **Price flash animations**: brief green/red background highlight on price change, fading over ~500ms via CSS transitions
- **Connection status indicator**: a small colored dot (green = connected, yellow = reconnecting, red = disconnected) visible in the header
- **Professional, data-dense layout**: inspired by Bloomberg/trading terminals — every pixel earns its place
- **Responsive but desktop-first**: optimized for wide screens, functional on tablet

### Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)

## 3. Architecture Overview

### Single Container, Single Port

```
┌─────────────────────────────────────────────────┐
│  Docker Container (port 8000)                   │
│                                                 │
│  FastAPI (Python/uv)                            │
│  ├── /api/*          REST endpoints             │
│  ├── /api/stream/*   SSE streaming              │
│  └── /*              Static file serving         │
│                      (Next.js export)            │
│                                                 │
│  SQLite database (volume-mounted)               │
│  Background task: market data polling/sim        │
└─────────────────────────────────────────────────┘
```

- **Frontend**: Next.js with TypeScript, built as a static export (`output: 'export'`), served by FastAPI as static files
- **Backend**: FastAPI (Python), managed as a `uv` project
- **Database**: SQLite, single file at `db/finally.db`, volume-mounted for persistence
- **Real-time data**: Server-Sent Events (SSE) — simpler than WebSockets, one-way server→client push, works everywhere
- **AI integration**: LiteLLM → OpenRouter (Cerebras for fast inference), with structured outputs for trade execution
- **Market data**: Environment-variable driven — simulator by default, real data via Massive API if key provided

### Why These Choices

| Decision | Rationale |
|---|---|
| SSE over WebSockets | One-way push is all we need; simpler, no bidirectional complexity, universal browser support |
| Static Next.js export | Single origin, no CORS issues, one port, one container, simple deployment |
| SQLite over Postgres | No auth = no multi-user = no need for a database server; self-contained, zero config |
| Single Docker container | Students run one command; no docker-compose for production, no service orchestration |
| uv for Python | Fast, modern Python project management; reproducible lockfile; what students should learn |
| Market orders only | Eliminates order book, limit order logic, partial fills — dramatically simpler portfolio math |

---

## 4. Directory Structure

```
finally/
├── frontend/                 # Next.js TypeScript project (static export)
├── backend/                  # FastAPI uv project (Python)
│   └── app/database/         # Schema definitions, seed data, init logic
├── planning/                 # Project-wide documentation for agents
│   ├── PLAN.md               # This document
│   └── ...                   # Additional agent reference docs
├── scripts/
│   ├── start_mac.sh          # Launch Docker container (macOS/Linux)
│   └── stop_mac.sh           # Stop Docker container (macOS/Linux)
├── test/                     # Playwright E2E tests (run locally against the app container)
├── db/                       # Volume mount target (SQLite file lives here at runtime)
│   └── .gitkeep              # Directory exists in repo; finally.db is gitignored
├── Dockerfile                # Multi-stage build (Node → Python)
├── .env                      # Environment variables (gitignored, .env.example committed)
└── .gitignore
```

### Key Boundaries

- **`frontend/`** is a self-contained Next.js project. It knows nothing about Python. It talks to the backend via `/api/*` endpoints and `/api/stream/*` SSE endpoints. Internal structure is up to the Frontend Engineer agent.
- **`backend/`** is a self-contained uv project with its own `pyproject.toml`. It owns all server logic including database initialization, schema, seed data, API routes, SSE streaming, market data, and LLM integration. Internal structure is up to the Backend/Market Data agents.
- **`backend/app/database/`** contains schema SQL definitions and seed logic. The backend initializes the database at startup (FastAPI lifespan) — creating tables and seeding default data if the SQLite file doesn't exist or is empty. (Named `database` to avoid confusion with the top-level `db/` runtime folder.)
- **`db/`** at the top level is the runtime volume mount point. The SQLite file (`db/finally.db`) is created here by the backend and persists across container restarts via Docker volume.
- **`planning/`** contains project-wide documentation, including this plan. All agents reference files here as the shared contract.
- **`test/`** contains Playwright E2E tests, run locally against the running app container. Unit tests live within `frontend/` and `backend/` respectively, following each framework's conventions.
- **`scripts/`** contains start/stop scripts that wrap Docker commands.

---

## 5. Environment Variables

```bash
# OpenRouter API key for LLM chat (required for real chat; not needed when LLM_MOCK=true)
OPENROUTER_API_KEY=your-openrouter-api-key-here

# Optional: Massive (Polygon.io) API key for real market data
# If not set, the built-in market simulator is used (recommended for most users)
MASSIVE_API_KEY=

# Optional: Set to "true" for deterministic mock LLM responses (testing)
LLM_MOCK=false

# Optional: SQLite file location (default: <project root>/db/finally.db)
DB_PATH=
```

### Behavior

- If `MASSIVE_API_KEY` is set and non-empty → backend uses Massive REST API for market data
- If `MASSIVE_API_KEY` is absent or empty → backend uses the built-in market simulator
- If `LLM_MOCK=true` → backend returns deterministic mock LLM responses (for E2E tests)
- If `OPENROUTER_API_KEY` is missing and `LLM_MOCK` is not `true` → the app still starts; only `POST /api/chat` fails, with a clear error (see Section 8)
- If `DB_PATH` is unset → local dev uses `<project root>/db/finally.db` (resolved from the code's location, not the working directory). The Dockerfile sets `DB_PATH=/app/db/finally.db`. Tests point it at a temp file.
- The backend reads `.env` from the project root (mounted into the container or read via docker `--env-file`)

---

## 6. Market Data

**Status: complete** (`backend/app/market/`). See `planning/MARKET_DATA_SUMMARY.md` for the API and usage. Do not rebuild it; downstream code only uses it as described there.

### Two Implementations, One Interface

Both the simulator and the Massive client implement the same abstract interface. The backend selects which to use based on the environment variable. All downstream code (SSE streaming, price cache, frontend) is agnostic to the source.

### Simulator (Default)

- Generates prices using geometric Brownian motion (GBM) with configurable drift and volatility per ticker
- Updates at ~500ms intervals
- Correlated moves across tickers (e.g., tech stocks move together)
- Occasional random "events" — sudden 2-5% moves on a ticker for drama
- Starts from realistic seed prices (e.g., AAPL ~$190, GOOGL ~$175, etc.)
- Runs as an in-process background task — no external dependencies

### Massive API (Optional)

- REST API polling (not WebSocket) — simpler, works on all tiers
- Polls for all tracked tickers (see below) on a configurable interval
- An invalid symbol simply never receives a price
- Free tier (5 calls/min): poll every 15 seconds
- Paid tiers: poll every 2-15 seconds depending on tier
- Parses REST response into the same format as the simulator

### Shared Price Cache

- A single background task (simulator or Massive poller) writes to an in-memory price cache
- The cache holds the latest price, previous price, and timestamp for each ticker
- SSE streams read from this cache and push updates to connected clients
- This architecture supports future multi-user scenarios without changes to the data layer

### Tracked Tickers and Validation

- The tickers the market data source tracks are the **union of watchlist tickers and tickers with an open position**. This keeps held positions priced after they are removed from the watchlist.
- Removing a ticker from the watchlist stops tracking it only if no position exists. Closing a position (selling to zero) stops tracking it only if it is not on the watchlist.
- Tickers are normalized to uppercase and must match 1-5 letters (`^[A-Z]{1,5}$`).
- The simulator prices any well-formed symbol (unknown tickers get a random seed price between $50 and $300), so no external ticker lookup is needed.
- Trades are only allowed for tickers that currently have a price in the cache; in practice this means tickers on the watchlist or already held.

### SSE Streaming

- Endpoint: `GET /api/stream/prices`
- Long-lived SSE connection; client uses native `EventSource` API
- Server pushes price updates for all tracked tickers at a regular cadence (~500ms)
- Each SSE event contains ticker, price, previous price, timestamp, and change direction
- Client handles reconnection automatically (EventSource has built-in retry)

---

## 7. Database

### SQLite with Initialization on Startup

The backend checks the SQLite database at startup, in the FastAPI lifespan handler (not per request). If the file doesn't exist or tables are missing, it creates the schema and seeds default data. This means:

- No separate migration step
- No manual database setup
- Fresh Docker volumes start with a clean, seeded database automatically

The file location comes from `DB_PATH` (see Section 5).

### Schema

All tables except `users_profile` include a `user_id` column defaulting to `"default"`; in `users_profile`, the `id` column is the user id. This is hardcoded for now (single-user) but enables future multi-user support without schema migration.

**users_profile** — User state (cash balance)
- `id` TEXT PRIMARY KEY (default: `"default"`)
- `cash_balance` REAL (default: `10000.0`)
- `created_at` TEXT (ISO timestamp)

**watchlist** — Tickers the user is watching
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `added_at` TEXT (ISO timestamp)
- UNIQUE constraint on `(user_id, ticker)`

**positions** — Current holdings (one row per ticker per user)
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `quantity` REAL (fractional shares supported)
- `avg_cost` REAL
- `updated_at` TEXT (ISO timestamp)
- UNIQUE constraint on `(user_id, ticker)`
- The row is deleted when quantity reaches zero (treat `abs(quantity) < 1e-9` as zero, since fractional shares use floats)

**trades** — Trade history (append-only log)
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `ticker` TEXT
- `side` TEXT (`"buy"` or `"sell"`)
- `quantity` REAL (fractional shares supported)
- `price` REAL
- `executed_at` TEXT (ISO timestamp)

**portfolio_snapshots** — Portfolio value over time (for P&L chart). Recorded once at startup (so the chart is never empty), every 30 seconds by a background task, and immediately after each trade execution. Rows are never pruned (~2,900 per day); this growth is accepted for a demo app.
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `total_value` REAL
- `recorded_at` TEXT (ISO timestamp)

**chat_messages** — Conversation history with LLM
- `id` TEXT PRIMARY KEY (UUID)
- `user_id` TEXT (default: `"default"`)
- `role` TEXT (`"user"` or `"assistant"`)
- `content` TEXT
- `actions` TEXT (JSON — the per-action results array returned by `POST /api/chat`, including failures; null for user messages)
- `created_at` TEXT (ISO timestamp)

### Default Seed Data

- One user profile: `id="default"`, `cash_balance=10000.0`
- Ten watchlist entries: AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX

---

## 8. API Endpoints

This section is the contract between the frontend and backend agents.

### Market Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stream/prices` | SSE stream of live price updates for all tracked tickers |

### Portfolio
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio` | Current positions, cash balance, total value, unrealized P&L |
| POST | `/api/portfolio/trade` | Execute a trade: `{ticker, quantity, side}` |
| GET | `/api/portfolio/history` | Portfolio value snapshots over time (for P&L chart) |

### Watchlist
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/watchlist` | Current watchlist tickers with latest prices |
| POST | `/api/watchlist` | Add a ticker: `{ticker}` |
| DELETE | `/api/watchlist/{ticker}` | Remove a ticker |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Send a message, receive complete JSON response (message + per-action results) |
| GET | `/api/chat/history` | All stored chat messages, oldest first (to restore the chat panel on page load) |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (for Docker/deployment) |

### Errors

- Business-rule failures (insufficient cash, unknown ticker, etc.) return **400** with FastAPI's standard body: `{"detail": "Insufficient cash: need $1,900.00, have $1,200.00"}`
- Malformed request bodies return FastAPI's default **422**
- Not found returns **404**, duplicates return **409**

### Request and Response Shapes

**`GET /api/portfolio`** → 200
```json
{
  "cash_balance": 8100.0,
  "total_value": 10250.5,
  "unrealized_pnl": 150.5,
  "positions": [
    {"ticker": "AAPL", "quantity": 10, "avg_cost": 190.0, "current_price": 205.05,
     "market_value": 2050.5, "unrealized_pnl": 150.5, "pnl_percent": 7.92}
  ]
}
```

**`POST /api/portfolio/trade`** — body `{"ticker": "AAPL", "quantity": 10, "side": "buy"}` → 200
```json
{
  "trade": {"id": "uuid", "ticker": "AAPL", "side": "buy", "quantity": 10, "price": 190.0, "executed_at": "2026-11-10T14:00:00Z"},
  "cash_balance": 8100.0
}
```
- Validation: `quantity > 0`; `side` is `buy` or `sell`; ticker normalized and must have a cached price (Section 6); sufficient cash for buys; sufficient shares for sells. Failures → 400.
- The cash update, position update, trade insert and post-trade snapshot happen in **one SQLite transaction**.

**`GET /api/portfolio/history`** → 200, all snapshots, oldest first
```json
[{"total_value": 10000.0, "recorded_at": "2026-11-10T14:00:00Z"}]
```

**`GET /api/watchlist`** → 200 (`price` fields are `null` until the first price arrives)
```json
[{"ticker": "AAPL", "price": 190.12, "previous_price": 190.05, "direction": "up"}]
```

**`POST /api/watchlist`** — body `{"ticker": "pypl"}` → 201 `{"ticker": "PYPL"}`. Invalid format → 400; already present → 409.

**`DELETE /api/watchlist/{ticker}`** → 204. Not on watchlist → 404.

**`POST /api/chat`** — body `{"message": "Buy 5 NVDA"}` → 200
```json
{
  "message": "Bought 5 NVDA at $875.20.",
  "actions": [
    {"type": "trade", "ticker": "NVDA", "side": "buy", "quantity": 5, "status": "executed", "price": 875.2, "error": null},
    {"type": "watchlist", "ticker": "PYPL", "action": "add", "status": "failed", "error": "Already on watchlist"}
  ]
}
```
- `OPENROUTER_API_KEY` missing (and not in mock mode) → 503 `{"detail": "LLM not configured: set OPENROUTER_API_KEY or LLM_MOCK=true"}`
- LLM call fails or returns unparseable output → 502 with a short `detail`

**`GET /api/chat/history`** → 200, all messages, oldest first
```json
[{"role": "user", "content": "Buy 5 NVDA", "actions": null, "created_at": "2026-11-10T14:00:00Z"}]
```

**`GET /api/health`** → 200 `{"status": "ok"}`

---

## 9. LLM Integration

When writing code to make calls to LLMs, use cerebras-inference skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. Structured Outputs should be used to interpret the results.

There is an OPENROUTER_API_KEY in the .env file in the project root.

### How It Works

When the user sends a chat message, the backend:

1. Loads the user's current portfolio context (cash, positions with P&L, watchlist with live prices, total portfolio value)
2. Loads the last 20 messages from the `chat_messages` table (including stored action results, so the LLM sees what succeeded or failed previously)
3. Constructs a prompt with a system message, portfolio context, conversation history, and the user's new message
4. Calls the LLM via LiteLLM → OpenRouter, requesting structured output, using the cerebras-inference skill
5. Parses the complete structured JSON response
6. Auto-executes any trades or watchlist changes specified in the response, recording a result (`executed` or `failed` with an error) for each
7. Stores the user message, the assistant message, and the action results in `chat_messages`
8. Returns the LLM message plus the action results to the frontend (shape in Section 8). There is one LLM call per user message — no second call after execution. No token-by-token streaming — Cerebras inference is fast enough that a loading indicator is sufficient.

### Structured Output Schema

The LLM is instructed to respond with JSON matching this schema:

```json
{
  "message": "Your conversational response to the user",
  "trades": [
    {"ticker": "AAPL", "side": "buy", "quantity": 10}
  ],
  "watchlist_changes": [
    {"ticker": "PYPL", "action": "add"}
  ]
}
```

All three fields are **required** (strict structured-output mode expects every property to be required); the arrays may be empty.

- `message`: The conversational text shown to the user
- `trades`: Array of trades to auto-execute. Each trade goes through the same validation as manual trades (Section 8)
- `watchlist_changes`: Array of watchlist modifications (`action` is `add` or `remove`)

Define the schema once as a Pydantic model and use it both for the structured-output request and to validate the response.

### Auto-Execution

Trades specified by the LLM execute automatically — no confirmation dialog. This is a deliberate design choice:
- It's a simulated environment with fake money, so the stakes are zero
- It creates an impressive, fluid demo experience
- It demonstrates agentic AI capabilities — the core theme of the course

If an action fails validation (e.g., insufficient cash), it is returned with `status: "failed"` and an `error` in the `actions` array. The LLM's message was written before execution, so the frontend shows the failure inline next to the message. The result is stored, so the LLM sees it in history on the next turn.

### System Prompt Guidance

The LLM should be prompted as "FinAlly, an AI trading assistant" with instructions to:
- Analyze portfolio composition, risk concentration, and P&L
- Suggest trades with reasoning
- Execute trades when the user asks or agrees
- Manage the watchlist proactively
- Be concise and data-driven in responses
- Always respond with valid structured JSON

### LLM Mock Mode

When `LLM_MOCK=true`, the backend returns deterministic mock responses instead of calling OpenRouter. Rules:

- A message containing `buy N TICKER` or `sell N TICKER` (case-insensitive, e.g. "buy 5 AAPL") returns a fixed confirmation message and that one trade, which then executes normally
- Any other message returns a fixed message with empty `trades` and `watchlist_changes`

This enables:
- Fast, free, reproducible E2E tests
- Development without an API key
- CI/CD pipelines

---

## 10. Frontend Design

### Layout

The frontend is a single-page application with a dense, terminal-inspired layout. The specific component architecture and layout system is up to the Frontend Engineer, but the UI should include these elements:

- **Watchlist panel** — grid/table of watched tickers with: ticker symbol, current price (flashing green/red on change), "Chg %" (change since the first price received after page load, the same baseline as the sparkline; resets on refresh), and a sparkline mini-chart (accumulated from SSE since page load)
- **Main chart area** — larger chart for the currently selected ticker, with at minimum price over time. Clicking a ticker in the watchlist selects it here.
- **Portfolio heatmap** — treemap visualization where each rectangle is a position, sized by portfolio weight, colored by P&L (green = profit, red = loss)
- **P&L chart** — line chart showing total portfolio value over time, using data from `portfolio_snapshots`
- **Positions table** — tabular view of all positions: ticker, quantity, avg cost, current price, unrealized P&L, % change
- **Trade bar** — simple input area: ticker field, quantity field, buy button, sell button. Market orders, instant fill.
- **AI chat panel** — docked/collapsible sidebar. Message input, scrolling conversation history (loaded from `GET /api/chat/history` on page load), loading indicator while waiting for LLM response. Trade executions and watchlist changes shown inline as confirmations; failed actions shown inline with their error.
- **Header** — portfolio total value (updating live), connection status indicator, cash balance

### Technical Notes

- Use `EventSource` for SSE connection to `/api/stream/prices`
- Live total value: computed on the frontend from SSE prices plus the last-fetched positions and cash. Refetch `/api/portfolio` after each trade and each chat response. No polling.
- Charts: use **Recharts** for everything (main chart, P&L chart, sparklines, treemap). It is SVG-based rather than canvas, which is fine at this data volume, and one library covers all four chart types.
- Price flash effect: on receiving a new price, briefly apply a CSS class with background color transition, then remove it
- All API calls go to the same origin (`/api/*`) — no CORS configuration needed
- Tailwind CSS for styling with a custom dark theme

---

## 11. Docker & Deployment

### Multi-Stage Dockerfile

```
Stage 1: Node 20 slim
  - Copy frontend/
  - npm install && npm run build (produces static export)

Stage 2: Python 3.12 slim
  - Install uv
  - Copy backend/
  - uv sync (install Python dependencies from lockfile)
  - Copy frontend build output into a static/ directory
  - ENV DB_PATH=/app/db/finally.db
  - Expose port 8000
  - CMD: uvicorn serving FastAPI app
```

FastAPI serves the static frontend files and all API routes on port 8000. Register all `/api/*` routes (including the SSE route) **before** mounting the static export at `/`, so the catch-all static mount does not swallow them.

### Docker Volume

The SQLite database persists via a named Docker volume:

```bash
docker run -v finally-data:/app/db -p 8000:8000 --env-file .env finally
```

The `db/` directory in the project root maps to `/app/db` in the container. The backend writes `finally.db` to this path.

### Start/Stop Scripts

**`scripts/start_mac.sh`** (macOS/Linux):
- Builds the Docker image if not already built (or if `--build` flag passed)
- Runs the container with the volume mount, port mapping, and `.env` file
- Prints the URL to access the app
- Optionally opens the browser

**`scripts/stop_mac.sh`** (macOS/Linux):
- Stops and removes the running container
- Does NOT remove the volume (data persists)

Windows scripts are out of scope for now. There is no `docker-compose.yml`; the start/stop scripts are the only wrapper around `docker run`.

All scripts should be idempotent — safe to run multiple times.

### Optional Cloud Deployment

The container is designed to deploy to AWS App Runner, Render, or any container platform. A Terraform configuration for App Runner may be provided in a `deploy/` directory as a stretch goal, but is not part of the core build.

---

## 12. Testing Strategy

### Unit Tests (within `frontend/` and `backend/`)

**Backend (pytest)**:
- Market data: simulator generates valid prices, GBM math is correct, Massive API response parsing works, both implementations conform to the abstract interface
- Portfolio: trade execution logic, P&L calculations, edge cases (selling more than owned, buying with insufficient cash, selling at a loss)
- LLM: structured output parsing handles all valid schemas, graceful handling of malformed responses, trade validation within chat flow
- API routes: correct status codes, response shapes, error handling

**Frontend (React Testing Library or similar)** — kept small, since E2E covers watchlist CRUD, trades and chat:
- Pure calculation logic (P&L, position weights, live total value, Chg %)
- Price flash animation triggers correctly on price changes

### E2E Tests (in `test/`)

**Infrastructure**: Playwright installed and run locally from `test/` against the running app container (started with the normal start script). Browser dependencies stay out of the production image. Revisit a containerized Playwright setup only if CI is added.

**Environment**: Tests run with `LLM_MOCK=true` by default for speed and determinism.

**Key Scenarios**:
- Fresh start: default watchlist appears, $10k balance shown, prices are streaming
- Add and remove a ticker from the watchlist
- Buy shares: cash decreases, position appears, portfolio updates
- Sell shares: cash increases, position updates or disappears
- Portfolio visualization: heatmap renders with correct colors, P&L chart has data points
- AI chat (mocked): send "buy N TICKER", receive a response, trade execution appears inline

**Manual check** (not automated): SSE resilience — restart the container while the page is open and confirm the status dot goes yellow/red and returns to green.

