"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Side } from "@/lib/types";

interface Props {
  selected: string | null;
  onTrade: (ticker: string, quantity: number, side: Side) => Promise<void>;
}

type Feedback = { kind: "ok" | "error"; text: string } | null;

export default function TradeBar({ selected, onTrade }: Props) {
  const [ticker, setTicker] = useState(selected ?? "");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Clicking a ticker elsewhere pre-fills the trade ticker.
  useEffect(() => {
    if (selected) setTicker(selected);
  }, [selected]);

  async function trade(side: Side, e?: FormEvent) {
    e?.preventDefault();
    const t = ticker.trim().toUpperCase();
    const quantity = Number(qty);
    if (!t) return setFeedback({ kind: "error", text: "Enter a ticker." });
    if (!(quantity > 0)) return setFeedback({ kind: "error", text: "Enter a quantity above 0." });
    setBusy(true);
    setFeedback(null);
    try {
      await onTrade(t, quantity, side);
      setFeedback({ kind: "ok", text: `${side === "buy" ? "Bought" : "Sold"} ${quantity} ${t}` });
    } catch (err) {
      setFeedback({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const btn = "h-8 px-5 font-medium text-bright disabled:opacity-50";
  return (
    <form
      data-testid="trade-bar"
      onSubmit={(e) => trade("buy", e)}
      className="flex shrink-0 flex-wrap items-center gap-2 border border-line bg-panel px-3 py-2"
    >
      <span className="mr-1 text-muted">Market order</span>
      <input
        data-testid="trade-ticker"
        aria-label="Ticker"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Ticker"
        maxLength={5}
        className="num h-8 w-24 border border-line bg-ink px-2 uppercase text-bright placeholder:normal-case placeholder:text-muted"
      />
      <input
        data-testid="trade-quantity"
        aria-label="Quantity"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        type="number"
        min="0"
        step="any"
        className="num h-8 w-24 border border-line bg-ink px-2 text-bright placeholder:text-muted"
      />
      <button data-testid="trade-buy" type="submit" disabled={busy} className={`${btn} bg-secondary hover:brightness-125`}>
        Buy
      </button>
      <button
        data-testid="trade-sell"
        type="button"
        disabled={busy}
        onClick={() => trade("sell")}
        className={`${btn} border border-secondary hover:bg-secondary/30`}
      >
        Sell
      </button>
      {feedback && (
        <span
          data-testid={feedback.kind === "ok" ? "trade-success" : "trade-error"}
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`ml-2 ${feedback.kind === "ok" ? "text-up" : "text-down"}`}
        >
          {feedback.text}
        </span>
      )}
    </form>
  );
}
