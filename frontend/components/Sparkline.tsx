"use client";

import { Line, LineChart, YAxis } from "recharts";
import type { PricePoint } from "@/lib/types";

interface Props {
  points: PricePoint[];
  up: boolean;
}

export default function Sparkline({ points, up }: Props) {
  if (points.length < 2) return <div className="h-6 w-20" />;
  return (
    <LineChart width={80} height={24} data={points.slice(-120)}>
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line
        type="linear"
        dataKey="price"
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        strokeWidth={1.25}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
