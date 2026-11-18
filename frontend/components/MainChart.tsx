"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Panel from "./Panel";
import { changePercent } from "@/lib/calc";
import { fmtPct, fmtPrice, signClass } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

interface Props {
  ticker: string | null;
  points: PricePoint[];
  baseline: number | undefined;
}

const timeFmt = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function MainChart({ ticker, points, baseline }: Props) {
  const last = points.at(-1)?.price;
  const chg = changePercent(last, baseline);
  const title = (
    <span className="flex items-baseline gap-3">
      <span data-testid="main-chart-ticker" className="text-[13px] font-semibold text-accent">
        {ticker ?? "No ticker selected"}
      </span>
      {ticker && (
        <>
          <span className="num text-[15px] text-bright">{fmtPrice(last)}</span>
          <span className={`num ${signClass(chg)}`}>{fmtPct(chg)}</span>
          <span className="text-muted">since page load</span>
        </>
      )}
    </span>
  );

  return (
    <Panel title={title} testId="main-chart" className="h-full">
      {points.length < 2 ? (
        <div className="flex h-full items-center justify-center text-muted">
          {ticker ? "Collecting prices..." : "Click a ticker in the watchlist to chart it."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="mainFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={timeFmt}
              stroke="var(--color-muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-line)" }}
              minTickGap={60}
            />
            <YAxis
              orientation="right"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(2)}
              stroke="var(--color-muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-raised)",
                border: "1px solid var(--color-line)",
                fontSize: 12,
              }}
              labelFormatter={(t) => timeFmt(Number(t))}
              formatter={(v) => [fmtPrice(Number(v)), ticker]}
            />
            <Area
              type="linear"
              dataKey="price"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              fill="url(#mainFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
