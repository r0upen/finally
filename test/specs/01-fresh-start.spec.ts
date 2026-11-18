import { test, expect } from "@playwright/test";
import { ids } from "../helpers/ids";
import { DEFAULT_TICKERS, getPortfolio, getWatchlist, parseMoney } from "../helpers/api";

// Set FRESH_DB=1 after `docker volume rm finally-data` to also assert the exact seed state.
const FRESH = process.env.FRESH_DB === "1";

test.describe("fresh start", () => {
  test("seed state: default watchlist and $10,000 cash", async ({ page, request }) => {
    test.skip(!FRESH, "Exact seed assertions need a fresh volume (FRESH_DB=1)");
    const p = await getPortfolio(request);
    expect(p.cash_balance).toBe(10000);
    expect(p.positions).toEqual([]);
    const w = await getWatchlist(request);
    expect(w.map((x) => x.ticker).sort()).toEqual([...DEFAULT_TICKERS].sort());

    await page.goto("/");
    await expect(page.getByTestId(ids.headerCash)).toHaveText(/\$10,000(\.00)?/);
    for (const t of DEFAULT_TICKERS) await expect(page.getByTestId(ids.watchRow(t))).toBeVisible();
  });

  test("watchlist and cash shown match the backend", async ({ page, request }) => {
    const w = await getWatchlist(request);
    const p = await getPortfolio(request);
    await page.goto("/");
    for (const { ticker } of w) await expect(page.getByTestId(ids.watchRow(ticker))).toBeVisible();
    await expect
      .poll(async () => parseMoney(await page.getByTestId(ids.headerCash).textContent()))
      .toBeCloseTo(p.cash_balance, 2);
  });

  test("prices stream and connection dot is green", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId(ids.connection)).toHaveAttribute("data-status", "connected");
    const price = page.getByTestId(ids.watchPrice("AAPL"));
    await expect(price).toHaveText(/\d/);
    const first = await price.textContent();
    // Simulator ticks every ~500ms; within a few seconds the displayed price must change.
    await expect.poll(async () => price.textContent(), { timeout: 10_000 }).not.toBe(first);
  });

  test("clicking a ticker selects it in the main chart", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId(ids.watchRow("MSFT")).click();
    await expect(page.getByTestId(ids.mainChartTicker)).toHaveText("MSFT");
  });
});
