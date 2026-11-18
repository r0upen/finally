import { test, expect } from "@playwright/test";
import { ids } from "../helpers/ids";
import { apiTrade, ensureWatched, waitForPrice } from "../helpers/api";

const TICKERS = ["AAPL", "NVDA"];

// Returns "green" | "red" | "other" for the P&L color painted on a heatmap cell
// (SVG fill or CSS background, on its first rect/div child or the cell itself).
async function cellColor(cell: import("@playwright/test").Locator) {
  return cell.evaluate((el) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    // Check the painted child first: an SVG <g> reports the default black fill.
    const candidates = [el.querySelector("rect"), el.querySelector("div"), el].filter(Boolean) as Element[];
    for (const c of candidates) {
      const cs = getComputedStyle(c);
      for (const v of [c.getAttribute("fill") ?? "", cs.fill, cs.backgroundColor]) {
        const rgb = parse(v);
        if (rgb && !(rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0 && v.startsWith("rgba"))) {
          const [r, g] = rgb;
          if (g > r + 20) return "green";
          if (r > g + 20) return "red";
          return "other";
        }
      }
    }
    return "none";
  });
}

test.describe("portfolio visualizations", () => {
  test.beforeAll(async ({ request }) => {
    for (const t of TICKERS) {
      await ensureWatched(request, t);
      await waitForPrice(request, t);
      await apiTrade(request, t, 1, "buy");
    }
  });

  test("heatmap shows a cell per position colored by P&L sign", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId(ids.heatmap)).toBeVisible();
    for (const t of TICKERS) {
      const cell = page.getByTestId(ids.heatmapCell(t));
      await expect(cell).toBeVisible();
      await expect(cell).toHaveAttribute("data-pnl", /^(profit|loss)$/);
      // Read sign and color in quick succession; retry if a tick flipped the sign in between.
      await expect
        .poll(async () => {
          const sign = await cell.getAttribute("data-pnl");
          const color = await cellColor(cell);
          return `${sign}:${color}`;
        })
        .toMatch(/^(profit:green|loss:red)$/);
    }
  });

  test("P&L chart has data points", async ({ page, request }) => {
    const hist = await (await request.get("/api/portfolio/history")).json();
    expect(hist.length).toBeGreaterThan(0);
    await page.goto("/");
    const chart = page.getByTestId(ids.pnlChart);
    await expect(chart).toBeVisible();
    // Recharts draws the series as an SVG path; a non-empty "d" means it plotted points.
    const line = chart.locator("path.recharts-curve, path.recharts-line-curve, path.recharts-area-curve").first();
    await expect(line).toHaveAttribute("d", /\d/);
  });
});
