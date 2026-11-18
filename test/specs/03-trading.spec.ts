import { test, expect, Page } from "@playwright/test";
import { ids } from "../helpers/ids";
import { apiTrade, expectMoney, ensureWatched, getPortfolio, parseMoney, positionQty, waitForPrice } from "../helpers/api";

const TICKER = "JPM";

async function tradeViaUi(page: Page, ticker: string, qty: number, side: "buy" | "sell") {
  await page.getByTestId(ids.tradeTicker).fill(ticker);
  await page.getByTestId(ids.tradeQty).fill(String(qty));
  const respP = page.waitForResponse((r) => r.url().endsWith("/api/portfolio/trade") && r.request().method() === "POST");
  await page.getByTestId(side === "buy" ? ids.tradeBuy : ids.tradeSell).click();
  const resp = await respP;
  expect(resp.status(), await resp.text()).toBe(200);
  return resp.json() as Promise<{ trade: { price: number; quantity: number }; cash_balance: number }>;
}

async function uiQty(page: Page, ticker: string) {
  return parseMoney(await page.getByTestId(ids.positionQty(ticker)).textContent());
}

async function uiCash(page: Page) {
  return parseMoney(await page.getByTestId(ids.headerCash).textContent());
}

test.describe("trading", () => {
  test.beforeEach(async ({ request }) => {
    await ensureWatched(request, TICKER);
    await waitForPrice(request, TICKER);
  });

  test("buy: cash decreases and position appears", async ({ page, request }) => {
    const before = await getPortfolio(request);
    const qtyBefore = positionQty(before, TICKER);
    await page.goto("/");
    await expect.poll(() => uiCash(page)).toBeCloseTo(before.cash_balance, 2);

    const { trade, cash_balance } = await tradeViaUi(page, TICKER, 2, "buy");
    expectMoney(cash_balance, before.cash_balance - 2 * trade.price);

    await expect.poll(() => uiCash(page)).toBeCloseTo(cash_balance, 2);
    await expect(page.getByTestId(ids.positionRow(TICKER))).toBeVisible();
    await expect.poll(() => uiQty(page, TICKER)).toBeCloseTo(qtyBefore + 2, 4);
    expect(positionQty(await getPortfolio(request), TICKER)).toBeCloseTo(qtyBefore + 2, 6);
  });

  test("sell part: cash increases and position shrinks", async ({ page, request }) => {
    await apiTrade(request, TICKER, 3, "buy");
    const before = await getPortfolio(request);
    const qtyBefore = positionQty(before, TICKER);
    await page.goto("/");
    await expect.poll(() => uiQty(page, TICKER)).toBeCloseTo(qtyBefore, 4);

    const { trade, cash_balance } = await tradeViaUi(page, TICKER, 1, "sell");
    expectMoney(cash_balance, before.cash_balance + trade.price);
    await expect.poll(() => uiCash(page)).toBeCloseTo(cash_balance, 2);
    await expect.poll(() => uiQty(page, TICKER)).toBeCloseTo(qtyBefore - 1, 4);
  });

  test("sell all: position disappears", async ({ page, request }) => {
    await apiTrade(request, TICKER, 1, "buy");
    const qty = positionQty(await getPortfolio(request), TICKER);
    await page.goto("/");
    await expect(page.getByTestId(ids.positionRow(TICKER))).toBeVisible();
    await tradeViaUi(page, TICKER, qty, "sell");
    await expect(page.getByTestId(ids.positionRow(TICKER))).toHaveCount(0);
    expect(positionQty(await getPortfolio(request), TICKER)).toBe(0);
  });

  test("buy with insufficient cash shows an error and changes nothing", async ({ page, request }) => {
    const before = await getPortfolio(request);
    await page.goto("/");
    await page.getByTestId(ids.tradeTicker).fill(TICKER);
    await page.getByTestId(ids.tradeQty).fill("1000000");
    await page.getByTestId(ids.tradeBuy).click();
    await expect(page.getByTestId(ids.tradeError)).toContainText(/insufficient cash/i);
    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance, 6);
    expect(positionQty(after, TICKER)).toBeCloseTo(positionQty(before, TICKER), 6);
  });
});
