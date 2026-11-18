import { test, expect } from "@playwright/test";
import { apiTrade, expectMoney, ensureNotWatched, ensureWatched, getPortfolio, positionQty, waitForPrice } from "../helpers/api";

// API contract checks for PLAN.md Section 8. Robust to a non-fresh DB.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

test.describe("API contract", () => {
  test("GET /api/health", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/portfolio shape", async ({ request }) => {
    const p = await getPortfolio(request);
    expect(typeof p.cash_balance).toBe("number");
    expect(typeof p.total_value).toBe("number");
    expect(typeof p.unrealized_pnl).toBe("number");
    expect(Array.isArray(p.positions)).toBe(true);
    let mv = 0;
    for (const pos of p.positions) {
      for (const k of ["quantity", "avg_cost", "current_price", "market_value", "unrealized_pnl", "pnl_percent"] as const)
        expect(typeof pos[k], k).toBe("number");
      mv += pos.market_value;
    }
    expect(p.total_value).toBeCloseTo(p.cash_balance + mv, 1);
  });

  test("GET /api/portfolio/history: non-empty, oldest first", async ({ request }) => {
    const res = await request.get("/api/portfolio/history");
    expect(res.status()).toBe(200);
    const h = await res.json();
    expect(h.length).toBeGreaterThan(0);
    for (const row of h) {
      expect(typeof row.total_value).toBe("number");
      expect(row.recorded_at).toMatch(ISO);
    }
    const times = h.map((r: { recorded_at: string }) => r.recorded_at);
    expect([...times].sort()).toEqual(times);
  });

  test("GET /api/watchlist shape", async ({ request }) => {
    const res = await request.get("/api/watchlist");
    expect(res.status()).toBe(200);
    for (const w of await res.json()) {
      expect(w.ticker).toMatch(/^[A-Z]{1,5}$/);
      expect(Object.keys(w).sort()).toEqual(["direction", "previous_price", "price", "ticker"]);
    }
  });

  test("watchlist add/duplicate/invalid/remove/not-found status codes", async ({ request }) => {
    await ensureNotWatched(request, "PYPL");
    let res = await request.post("/api/watchlist", { data: { ticker: "pypl" } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ticker: "PYPL" });
    res = await request.post("/api/watchlist", { data: { ticker: "PYPL" } });
    expect(res.status()).toBe(409);
    for (const bad of ["TOOLONG", "AB1", "", "A-B"]) {
      res = await request.post("/api/watchlist", { data: { ticker: bad } });
      expect(res.status(), `ticker=${JSON.stringify(bad)}`).toBe(400);
      expect(typeof (await res.json()).detail).toBe("string");
    }
    res = await request.post("/api/watchlist", { data: {} });
    expect(res.status()).toBe(422);
    res = await request.delete("/api/watchlist/PYPL");
    expect(res.status()).toBe(204);
    res = await request.delete("/api/watchlist/PYPL");
    expect(res.status()).toBe(404);
  });

  test("trade: buy then sell, response shape and cash math", async ({ request }) => {
    await ensureWatched(request, "MSFT");
    await waitForPrice(request, "MSFT");
    const before = await getPortfolio(request);
    const buy = await apiTrade(request, "msft", 1.5, "buy");
    expect(buy.trade).toMatchObject({ ticker: "MSFT", side: "buy", quantity: 1.5 });
    expect(typeof buy.trade.id).toBe("string");
    expect(buy.trade.executed_at).toMatch(ISO);
    expectMoney(buy.cash_balance, before.cash_balance - 1.5 * buy.trade.price);
    const mid = await getPortfolio(request);
    expect(positionQty(mid, "MSFT")).toBeCloseTo(positionQty(before, "MSFT") + 1.5, 6);

    const sell = await apiTrade(request, "MSFT", 1.5, "sell");
    expect(sell.trade.side).toBe("sell");
    expectMoney(sell.cash_balance, buy.cash_balance + 1.5 * sell.trade.price);
  });

  test("trade validation failures return 400 with detail", async ({ request }) => {
    await ensureWatched(request, "MSFT");
    await waitForPrice(request, "MSFT");
    const held = positionQty(await getPortfolio(request), "MSFT");
    const cases = [
      { ticker: "MSFT", quantity: 0, side: "buy" },
      { ticker: "MSFT", quantity: -1, side: "buy" },
      { ticker: "MSFT", quantity: 1, side: "hold" },
      { ticker: "MSFT", quantity: 1e9, side: "buy" }, // insufficient cash
      { ticker: "MSFT", quantity: held + 1000, side: "sell" }, // insufficient shares
      { ticker: "ZZZZZ", quantity: 1, side: "buy" }, // well-formed but not tracked -> no price
      { ticker: "123", quantity: 1, side: "buy" }, // malformed ticker
    ];
    for (const c of cases) {
      const res = await request.post("/api/portfolio/trade", { data: c });
      // Pydantic-level validation may legitimately yield 422 for field-type issues;
      // PLAN says business-rule failures are 400.
      expect([400, 422], JSON.stringify(c)).toContain(res.status());
      if (res.status() === 400) expect(typeof (await res.json()).detail).toBe("string");
    }
    // These are explicitly business rules in PLAN Section 8 -> must be 400.
    for (const c of cases.slice(3)) {
      const res = await request.post("/api/portfolio/trade", { data: c });
      expect(res.status(), JSON.stringify(c)).toBe(400);
    }
    const res = await request.post("/api/portfolio/trade", { data: { ticker: "MSFT" } });
    expect(res.status()).toBe(422);
  });

  test("chat (mock): buy executes; plain message has no actions; history oldest first", async ({ request }) => {
    await ensureWatched(request, "NVDA");
    await waitForPrice(request, "NVDA");
    let res = await request.post("/api/chat", { data: { message: "Buy 1 NVDA" } });
    expect(res.status(), await res.text()).toBe(200);
    let body = await res.json();
    expect(body.message).toBe("Mock mode: placing your buy order for 1 NVDA.");
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({ type: "trade", ticker: "NVDA", side: "buy", quantity: 1, status: "executed", error: null });
    expect(typeof body.actions[0].price).toBe("number");

    res = await request.post("/api/chat", { data: { message: "how is my portfolio?" } });
    expect(res.status()).toBe(200);
    body = await res.json();
    expect(body).toEqual({ message: "Mock mode: I am FinAlly, your AI trading assistant. No actions taken.", actions: [] });

    res = await request.get("/api/chat/history");
    expect(res.status()).toBe(200);
    const hist = await res.json();
    const last4 = hist.slice(-4);
    expect(last4.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(last4[0]).toMatchObject({ content: "Buy 1 NVDA", actions: null });
    expect(last4[1].actions[0]).toMatchObject({ type: "trade", ticker: "NVDA", status: "executed" });
    for (const m of last4) expect(m.created_at).toMatch(ISO);
    const times = hist.map((m: { created_at: string }) => m.created_at);
    expect([...times].sort()).toEqual(times);

    res = await request.post("/api/chat", { data: {} });
    expect(res.status()).toBe(422);
  });

  test("SSE stream sends price events", async ({ page, baseURL }) => {
    // Use the browser's EventSource, as the frontend does.
    await page.goto(baseURL + "/api/health");
    const evt = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const es = new EventSource("/api/stream/prices");
          const t = setTimeout(() => { es.close(); reject(new Error("no SSE event in 5s")); }, 5000);
          es.onmessage = (e) => { clearTimeout(t); es.close(); resolve(e.data); };
        }),
    );
    const data = JSON.parse(evt);
    // Accept either a single update or a map/list of updates; each must carry the Section 6 fields.
    const updates: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : "ticker" in data ? [data] : Object.values(data);
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) {
      expect(u).toHaveProperty("ticker");
      expect(u).toHaveProperty("price");
      expect(u).toHaveProperty("previous_price");
      expect(u).toHaveProperty("timestamp");
      expect(u).toHaveProperty("direction");
    }
  });
});
