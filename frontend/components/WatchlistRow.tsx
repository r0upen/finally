"use client";

import Sparkline from "./Sparkline";
import { useFlash } from "@/lib/useFlash";
import { changePercent } from "@/lib/calc";
import { fmtPct, fmtPrice, signClass } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

interface Props {
  ticker: string;
  price: number | undefined;
  baseline: number | undefined;
  points: PricePoint[];
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

export default function WatchlistRow({ ticker, price, baseline, points, selected, onSelect, onRemove }: Props) {
  const flash = useFlash(price);
  const chg = changePercent(price, baseline);
  return (
    <tr
      data-testid={`watchlist-row-${ticker}`}
      aria-selected={selected}
      onClick={onSelect}
      className={`group cursor-pointer border-b border-line/60 hover:bg-raised ${
        selected ? "bg-raised shadow-[inset_2px_0_0_var(--color-accent)]" : ""
      }`}
    >
      <td className={`py-1.5 pl-3 font-medium ${selected ? "text-accent" : "text-bright"}`}>{ticker}</td>
      <td
        data-testid={`price-${ticker}`}
        className={`num flash-target px-2 text-right text-bright ${flash}`}
      >
        {fmtPrice(price)}
      </td>
      <td data-testid={`change-${ticker}`} className={`num px-2 text-right ${signClass(chg)}`}>
        {fmtPct(chg)}
      </td>
      <td className="px-1">
        <Sparkline points={points} up={(chg ?? 0) >= 0} />
      </td>
      <td className="pr-2 text-right">
        <button
          data-testid={`remove-${ticker}`}
          aria-label={`Remove ${ticker} from watchlist`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="px-1 text-muted opacity-0 group-hover:opacity-100 hover:text-down focus-visible:opacity-100"
        >
          &times;
        </button>
      </td>
    </tr>
  );
}
