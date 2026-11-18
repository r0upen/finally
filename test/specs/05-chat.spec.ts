import { test, expect } from "@playwright/test";
import { ids } from "../helpers/ids";
import { ensureWatched, getPortfolio, positionQty, waitForPrice } from "../helpers/api";

// Requires the container to run with LLM_MOCK=true.
const TICKER = "AMZN";

test.describe("AI chat (mock mode)", () => {
  test("'buy N TICKER' returns a reply and shows the executed trade inline", async ({ page, request }) => {
    await ensureWatched(request, TICKER);
    await waitForPrice(request, TICKER);
    const qtyBefore = positionQty(await getPortfolio(request), TICKER);

    await page.goto("/");
    const assistantMsgs = page.getByTestId(ids.chatAssistantMsg);
    const nBefore = await assistantMsgs.count();
    const actions = page.getByTestId(ids.chatAction);
    const aBefore = await actions.count();

    await page.getByTestId(ids.chatInput).fill(`buy 2 ${TICKER}`);
    const respP = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
    await page.getByTestId(ids.chatSend).click();
    const resp = await respP;
    expect(resp.status(), await resp.text()).toBe(200);
    const body = await resp.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({ type: "trade", ticker: TICKER, side: "buy", quantity: 2, status: "executed" });

    await expect(assistantMsgs).toHaveCount(nBefore + 1);
    expect(body.message).toBe(`Mock mode: placing your buy order for 2 ${TICKER}.`);
    await expect(assistantMsgs.last()).toContainText(body.message);
    const newAction = actions.nth(aBefore);
    await expect(actions).toHaveCount(aBefore + 1);
    await expect(newAction).toHaveAttribute("data-status", "executed");
    await expect(newAction).toContainText(TICKER);

    expect(positionQty(await getPortfolio(request), TICKER)).toBeCloseTo(qtyBefore + 2, 6);
    await expect(page.getByTestId(ids.positionRow(TICKER))).toBeVisible();
  });

  test("a failed chat trade is shown inline with its error", async ({ page }) => {
    await page.goto("/");
    const actions = page.getByTestId(ids.chatAction);
    const aBefore = await actions.count();
    await page.getByTestId(ids.chatInput).fill(`buy 1000000 ${TICKER}`);
    await page.getByTestId(ids.chatSend).click();
    await expect(actions).toHaveCount(aBefore + 1, { timeout: 15_000 });
    await expect(actions.nth(aBefore)).toHaveAttribute("data-status", "failed");
    await expect(actions.nth(aBefore)).toContainText(/insufficient/i);
  });

  test("chat history is restored after reload", async ({ page }) => {
    await page.goto("/");
    const nBefore = await page.getByTestId(ids.chatAssistantMsg).count();
    await page.getByTestId(ids.chatInput).fill("hello there");
    await page.getByTestId(ids.chatSend).click();
    await expect(page.getByTestId(ids.chatUserMsg).last()).toContainText("hello there");
    const n = nBefore + 1;
    await expect(page.getByTestId(ids.chatAssistantMsg)).toHaveCount(n);
    await page.reload();
    await expect(page.getByTestId(ids.chatUserMsg).last()).toContainText("hello there");
    await expect(page.getByTestId(ids.chatAssistantMsg)).toHaveCount(n);
  });
});
