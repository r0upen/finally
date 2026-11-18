"use client";

import { ResponsiveContainer, Treemap } from "recharts";
import Panel from "./Panel";
import { positionPnl, type PriceMap } from "@/lib/calc";
import { fmtPct } from "@/lib/format";
import type { Position } from "@/lib/types";

interface Props {
  positions: Position[];
  prices: PriceMap;
}

/** Green for profit, red for loss; opacity scales with |pnl %|, full at 5%. */
export function heatColor(pnlPercent: number): string {
  const t = Math.min(Math.abs(pnlPercent) / 5, 1);
  const alpha = (0.18 + 0.62 * t).toFixed(2);
  return pnlPercent >= 0 ? `rgba(47, 182, 124, ${alpha})` : `rgba(229, 72, 77, ${alpha})`;
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pnlPercent?: number;
}

function Cell({ x = 0, y = 0, width = 0, height = 0, name, pnlPercent = 0 }: CellProps) {
  if (!name) return null;
  const showLabel = width > 56 && height > 34;
  return (
    <g data-testid={`heatmap-cell-${name}`} data-pnl={pnlPercent >= 0 ? "profit" : "loss"}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={heatColor(pnlPercent)}
        stroke="var(--color-panel)"
        strokeWidth={2}
      />
      {showLabel && (
        <>
          <text x={x + 6} y={y + 16} fill="var(--color-bright)" fontSize={12} fontWeight={600}>
            {name}
          </text>
          <text x={x + 6} y={y + 30} fill="var(--color-bright)" fontSize={11} fontFamily="var(--font-mono)">
            {fmtPct(pnlPercent)}
          </text>
        </>
      )}
    </g>
  );
}

export default function Heatmap({ positions, prices }: Props) {
  const data = positions.map((p) => {
    const { marketValue, pnlPercent } = positionPnl(p, prices);
    return { name: p.ticker, size: Math.max(marketValue, 0.01), pnlPercent };
  });

  return (
    <Panel title="Positions heatmap" testId="heatmap" className="h-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-muted">
          Buy a stock to see your holdings here, sized by weight.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data} dataKey="size" content={<Cell />} isAnimationActive={false} />
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
