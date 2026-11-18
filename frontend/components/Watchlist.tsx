"use client";

import { useState, type FormEvent } from "react";
import Panel from "./Panel";
import WatchlistRow from "./WatchlistRow";
import type { StreamState } from "@/lib/usePriceStream";

interface Props {
  tickers: string[];
  stream: StreamState;
  selected: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
}

export default function Watchlist({ tickers, stream, selected, onSelect, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    setError(null);
    try {
      await onAdd(ticker);
      setInput("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(ticker: string) {
    setError(null);
    try {
      await onRemove(ticker);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Panel title="Watchlist" testId="watchlist" className="h-full">
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel text-[11px] text-muted">
              <tr className="border-b border-line">
                <th className="py-1 pl-3 text-left font-normal">Ticker</th>
                <th className="px-2 text-right font-normal">Last</th>
                <th className="px-2 text-right font-normal">Chg %</th>
                <th className="font-normal" />
                <th className="font-normal" />
              </tr>
            </thead>
            <tbody>
              {tickers.map((t) => (
                <WatchlistRow
                  key={t}
                  ticker={t}
                  price={stream.latest[t]?.price}
                  baseline={stream.baseline[t]}
                  points={stream.history[t] ?? []}
                  selected={t === selected}
                  onSelect={() => onSelect(t)}
                  onRemove={() => remove(t)}
                />
              ))}
            </tbody>
          </table>
          {tickers.length === 0 && (
            <p className="p-3 text-muted">Add a ticker below to start watching it.</p>
          )}
        </div>
        <form onSubmit={submit} className="shrink-0 border-t border-line p-2">
          <div className="flex gap-2">
            <input
              data-testid="watchlist-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add ticker, e.g. PYPL"
              maxLength={5}
              className="num min-w-0 flex-1 border border-line bg-ink px-2 py-1 uppercase text-bright placeholder:normal-case placeholder:text-muted"
            />
            <button
              data-testid="watchlist-add"
              type="submit"
              className="border border-line px-3 text-fg hover:border-primary hover:text-primary"
            >
              Add
            </button>
          </div>
          {error && (
            <p data-testid="watchlist-error" className="mt-1 text-down">
              {error}
            </p>
          )}
        </form>
      </div>
    </Panel>
  );
}
