# FinAlly E2E tests

Playwright (Chromium) tests run locally against the running app container.

## Setup

```bash
cd test
npm install
npx playwright install chromium
```

## Run

Start the app with `LLM_MOCK=true` in `.env`, then:

```bash
cd test
npm test                 # all specs
npm run test:api         # API contract only
npm run report           # open the HTML report
```

- `BASE_URL` overrides the target (default `http://localhost:8000`). If the app was started on
  another port (`PORT=8001 LLM_MOCK=true scripts/start_mac.sh --no-open`), use `BASE_URL=http://localhost:8001`.
- Specs share one SQLite database, so they run serially and assert deltas, not absolute values.
- Exact seed-state checks ($10,000 cash, the 10 default tickers) run only with `FRESH_DB=1`,
  on a fresh volume: `scripts/stop_mac.sh && docker volume rm finally-data && scripts/start_mac.sh`.

## Files

- `helpers/ids.ts` - every `data-testid` used (from the frontend source)
- `helpers/api.ts` - API helpers for setup and assertions
- `specs/` - fresh start, watchlist, trading, portfolio visuals, chat (mock), API contract
