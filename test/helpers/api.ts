import { APIRequestContext, expect } from "@playwright/test";

export const DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"];

export type Position = {
  ticker: string; quantity: number; avg_cost: number; current_price: number;
  market_value: number; unrealized_pnl: number; pnl_percent: number;
};
export type Portfolio = { cash_balance: number; total_value: number; unrealized_pnl: number; positions: Position[] };
export type WatchItem = { ticker: string; price: number | null; previous_price: number | null; direction: string | null };

export async function getPortfolio(request: APIRequestContext): Promise<Portfolio> {
  const res = await request.get("/api/portfolio");
  expect(res.status()).toBe(200);
  return res.json();
}

export async function getWatchlist(request: APIRequestContext): Promise<WatchItem[]> {
  const res = await request.get("/api/watchlist");
  expect(res.status()).toBe(200);
  return res.json();
}

export function positionQty(p: Portfolio, ticker: string): number {
  return p.positions.find((x) => x.ticker === ticker)?.quantity ?? 0;
}

export async function apiTrade(request: APIRequestContext, ticker: string, quantity: number, side: "buy" | "sell") {
  const res = await request.post("/api/portfolio/trade", { data: { ticker, quantity, side } });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

// Ensure a ticker is (or is not) on the watchlist, so specs work on a non-fresh DB.
export async function ensureNotWatched(request: APIRequestContext, ticker: string) {
  const res = await request.delete(`/api/watchlist/${ticker}`);
  expect([204, 404]).toContain(res.status());
}
export async function ensureWatched(request: APIRequestContext, ticker: string) {
  const res = await request.post("/api/watchlist", { data: { ticker } });
  expect([201, 409]).toContain(res.status());
}

// Wait until the price cache has a price for the ticker (simulator ticks ~500ms).
export async function waitForPrice(request: APIRequestContext, ticker: string): Promise<number> {
  let price: number | null = null;
  await expect
    .poll(async () => {
      const w = await getWatchlist(request);
      price = w.find((x) => x.ticker === ticker)?.price ?? null;
      return price;
    }, { timeout: 10_000 })
    .not.toBeNull();
  return price as unknown as number;
}

// "$10,000.00" -> 10000; "-$12.50" -> -12.5
export function parseMoney(text: string | null): number {
  const s = (text ?? "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  if (!s || Number.isNaN(n)) throw new Error(`Cannot parse money from "${text}"`);
  return n;
}

// API money values are rounded to cents, so a computed expectation can be off by up to ~1 cent.
export function expectMoney(actual: number, expected: number, msg?: string) {
  expect(Math.abs(actual - expected), msg ?? `${actual} vs ${expected}`).toBeLessThanOrEqual(0.011);
}
