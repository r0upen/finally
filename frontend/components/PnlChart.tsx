"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Panel from "./Panel";
import { fmtUsd } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

interface Props {
  snapshots: Snapshot[];
}

const STARTING_CASH = 10000;

const timeFmt = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

export default function PnlChart({ snapshots }: Props) {
  const data = snapshots.map((s) => ({ t: Date.parse(s.recorded_at), value: s.total_value }));
  return (
    <Panel title="Portfolio value" testId="pnl-chart" className="h-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted">No snapshots yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={timeFmt}
              stroke="var(--color-muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-line)" }}
              minTickGap={50}
            />
            <YAxis
              orientation="right"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
              stroke="var(--color-muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={76}
            />
            <ReferenceLine y={STARTING_CASH} stroke="var(--color-muted)" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                background: "var(--color-raised)",
                border: "1px solid var(--color-line)",
                fontSize: 12,
              }}
              labelFormatter={(t) => new Date(Number(t)).toLocaleString("en-US")}
              formatter={(v) => [fmtUsd(Number(v)), "Value"]}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              dot={data.length < 3}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
