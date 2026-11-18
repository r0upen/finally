import { test, expect } from "@playwright/test";
import { ids } from "../helpers/ids";
import { ensureNotWatched, getWatchlist } from "../helpers/api";

const TICKER = "PYPL";

test.describe("watchlist", () => {
  test.beforeEach(async ({ request }) => {
    await ensureNotWatched(request, TICKER);
  });

  test("add a ticker (lowercase input is normalized) and it gets a price", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByTestId(ids.watchRow(TICKER))).toHaveCount(0);
    await page.getByTestId(ids.watchAddInput).fill(TICKER.toLowerCase());
    await page.getByTestId(ids.watchAddButton).click();
    await expect(page.getByTestId(ids.watchRow(TICKER))).toBeVisible();
    await expect(page.getByTestId(ids.watchPrice(TICKER))).toHaveText(/\d/, { timeout: 15_000 });
    expect((await getWatchlist(request)).map((x) => x.ticker)).toContain(TICKER);
  });

  test("remove a ticker", async ({ page, request }) => {
    await request.post("/api/watchlist", { data: { ticker: TICKER } });
    await page.goto("/");
    await expect(page.getByTestId(ids.watchRow(TICKER))).toBeVisible();
    await page.getByTestId(ids.watchRemove(TICKER)).click();
    await expect(page.getByTestId(ids.watchRow(TICKER))).toHaveCount(0);
    expect((await getWatchlist(request)).map((x) => x.ticker)).not.toContain(TICKER);
  });
});
