# FinAlly frontend

Next.js (App Router) + TypeScript + Tailwind v4 + Recharts, built as a static export.

```bash
npm install
npm run dev     # http://localhost:3000, proxies /api to $BACKEND_URL (default http://localhost:8000)
npm run test    # Vitest unit tests
npm run build   # static export to out/ (served by FastAPI)
```

Test IDs for E2E are listed in `planning/FRONTEND_TESTIDS.md`.
