import { describe, expect, it } from "vitest";
import {
  changePercent,
  liveTotalValue,
  positionPnl,
  positionWeights,
  totalUnrealizedPnl,
} from "@/lib/calc";
import { applyUpdate, type StreamState } from "@/lib/usePriceStream";
import type { Position, PriceUpdate } from "@/lib/types";

const pos = (ticker: string, quantity: number, avg_cost: number, current_price: number): Position => ({
  ticker,
  quantity,
  avg_cost,
  current_price,
  market_value: quantity * current_price,
  unrealized_pnl: 0,
  pnl_percent: 0,
});

describe("positionPnl", () => {
  it("uses the live SSE price when available", () => {
    const r = positionPnl(pos("AAPL", 10, 190, 200), { AAPL: 209 });
    expect(r.price).toBe(209);
    expect(r.marketValue).toBe(2090);
    expect(r.pnl).toBeCloseTo(190);
    expect(r.pnlPercent).toBeCloseTo(10);
  });

  it("falls back to the last fetched price", () => {
    expect(positionPnl(pos("AAPL", 2, 100, 90), {}).pnl).toBeCloseTo(-20);
  });
});

describe("portfolio totals", () => {
  const positions = [pos("AAPL", 10, 190, 190), pos("TSLA", 5, 200, 200)];
  const prices = { AAPL: 200, TSLA: 180 };

  it("live total value is cash plus live market value", () => {
    expect(liveTotalValue(1000, positions, prices)).toBeCloseTo(1000 + 2000 + 900);
  });

  it("total unrealized P&L sums positions", () => {
    expect(totalUnrealizedPnl(positions, prices)).toBeCloseTo(100 - 100);
  });

  it("weights sum to 1 and exclude cash", () => {
    const w = positionWeights(positions, prices);
    expect(w.AAPL).toBeCloseTo(2000 / 2900);
    expect(w.AAPL + w.TSLA).toBeCloseTo(1);
  });

  it("weights are empty with no positions", () => {
    expect(positionWeights([], {})).toEqual({});
  });
});

describe("changePercent", () => {
  it("computes change from baseline", () => {
    expect(changePercent(110, 100)).toBeCloseTo(10);
    expect(changePercent(95, 100)).toBeCloseTo(-5);
  });

  it("returns null without a baseline", () => {
    expect(changePercent(100, undefined)).toBeNull();
    expect(changePercent(undefined, 100)).toBeNull();
  });
});

describe("applyUpdate", () => {
  const u = (price: number, timestamp: number): PriceUpdate => ({
    ticker: "AAPL",
    price,
    previous_price: price,
    timestamp,
    direction: "flat",
  });
  const empty: StreamState = { latest: {}, history: {}, baseline: {}, status: "connected" };

  it("records the first price as the baseline and appends history", () => {
    const s1 = applyUpdate(empty, { AAPL: u(100, 1) });
    const s2 = applyUpdate(s1, { AAPL: u(101, 2) });
    expect(s2.baseline.AAPL).toBe(100);
    expect(s2.history.AAPL.map((p) => p.price)).toEqual([100, 101]);
    expect(s2.latest.AAPL.price).toBe(101);
  });

  it("skips repeated identical updates", () => {
    const s1 = applyUpdate(empty, { AAPL: u(100, 1) });
    const s2 = applyUpdate(s1, { AAPL: u(100, 1) });
    expect(s2.history.AAPL).toHaveLength(1);
  });
});
