"use client";

import Panel from "./Panel";
import { positionPnl, type PriceMap } from "@/lib/calc";
import { fmtPct, fmtPrice, fmtQty, fmtSigned, signClass } from "@/lib/format";
import type { Position } from "@/lib/types";

interface Props {
  positions: Position[];
  prices: PriceMap;
  onSelect: (ticker: string) => void;
}

const HEADERS = ["Ticker", "Qty", "Avg cost", "Price", "Unrealized P&L", "% Chg"];

export default function PositionsTable({ positions, prices, onSelect }: Props) {
  return (
    <Panel title="Positions" testId="positions" className="h-full">
      <div className="h-full overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-panel text-[11px] text-muted">
            <tr className="border-b border-line">
              {HEADERS.map((h, i) => (
                <th key={h} className={`px-3 py-1 font-normal ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const { price, pnl, pnlPercent } = positionPnl(p, prices);
              return (
                <tr
                  key={p.ticker}
                  data-testid={`position-row-${p.ticker}`}
                  onClick={() => onSelect(p.ticker)}
                  className="cursor-pointer border-b border-line/60 hover:bg-raised"
                >
                  <td className="px-3 py-1.5 font-medium text-bright">{p.ticker}</td>
                  <td data-testid={`position-qty-${p.ticker}`} className="num px-3 text-right">
                    {fmtQty(p.quantity)}
                  </td>
                  <td className="num px-3 text-right">{fmtPrice(p.avg_cost)}</td>
                  <td className="num px-3 text-right text-bright">{fmtPrice(price)}</td>
                  <td data-testid={`position-pnl-${p.ticker}`} className={`num px-3 text-right ${signClass(pnl)}`}>
                    {fmtSigned(pnl)}
                  </td>
                  <td className={`num px-3 text-right ${signClass(pnlPercent)}`}>{fmtPct(pnlPercent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {positions.length === 0 && (
          <p data-testid="positions-empty" className="p-3 text-muted">
            No positions yet. Use the trade bar or ask the assistant to buy.
          </p>
        )}
      </div>
    </Panel>
  );
}
