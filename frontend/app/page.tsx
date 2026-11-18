"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Watchlist from "@/components/Watchlist";
import MainChart from "@/components/MainChart";
import Heatmap from "@/components/Heatmap";
import PnlChart from "@/components/PnlChart";
import PositionsTable from "@/components/PositionsTable";
import TradeBar from "@/components/TradeBar";
import ChatPanel from "@/components/ChatPanel";
import { api } from "@/lib/api";
import { liveTotalValue, totalUnrealizedPnl } from "@/lib/calc";
import { usePriceStream } from "@/lib/usePriceStream";
import type { ChatMessage, Portfolio, Side, Snapshot } from "@/lib/types";

export default function Home() {
  const stream = usePriceStream();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const refreshPortfolio = useCallback(async () => {
    const [p, h] = await Promise.all([api.portfolio(), api.history()]);
    setPortfolio(p);
    setSnapshots(h);
  }, []);

  const refreshWatchlist = useCallback(async () => {
    const w = await api.watchlist();
    const list = w.map((i) => i.ticker);
    setTickers(list);
    setSelected((s) => s ?? list[0] ?? null);
  }, []);

  useEffect(() => {
    refreshPortfolio().catch(() => {});
    refreshWatchlist().catch(() => {});
    api.chatHistory().then(setMessages).catch(() => {});
  }, [refreshPortfolio, refreshWatchlist]);

  const prices = useMemo(
    () => Object.fromEntries(Object.values(stream.latest).map((u) => [u.ticker, u.price])),
    [stream.latest],
  );
  const positions = portfolio?.positions ?? [];
  const totalValue = portfolio ? liveTotalValue(portfolio.cash_balance, positions, prices) : null;
  const pnl = portfolio ? totalUnrealizedPnl(positions, prices) : null;

  async function trade(ticker: string, quantity: number, side: Side) {
    await api.trade(ticker, quantity, side);
    await refreshPortfolio();
  }

  async function addTicker(ticker: string) {
    const res = await api.addTicker(ticker);
    setTickers((t) => (t.includes(res.ticker) ? t : [...t, res.ticker]));
  }

  async function removeTicker(ticker: string) {
    await api.removeTicker(ticker);
    setTickers((t) => t.filter((x) => x !== ticker));
    if (selected === ticker) setSelected(null);
  }

  async function sendChat(text: string) {
    setChatError(null);
    setMessages((m) => [...m, { role: "user", content: text, actions: null }]);
    setChatLoading(true);
    try {
      const res = await api.chat(text);
      setMessages((m) => [...m, { role: "assistant", content: res.message, actions: res.actions }]);
      await Promise.all([refreshPortfolio(), refreshWatchlist()]);
    } catch (err) {
      setChatError((err as Error).message);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="flex h-screen min-w-[900px] flex-col">
      <Header
        totalValue={totalValue}
        cash={portfolio?.cash_balance ?? null}
        pnl={pnl}
        status={stream.status}
      />
      <div className="flex min-h-0 flex-1">
        <main className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(300px,340px)_1fr] gap-1.5 p-1.5">
          <Watchlist
            tickers={tickers}
            stream={stream}
            selected={selected}
            onSelect={setSelected}
            onAdd={addTicker}
            onRemove={removeTicker}
          />
          <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
            <div className="min-h-[200px] flex-[5]">
              <MainChart
                ticker={selected}
                points={selected ? (stream.history[selected] ?? []) : []}
                baseline={selected ? stream.baseline[selected] : undefined}
              />
            </div>
            <div className="grid min-h-[160px] flex-[4] grid-cols-2 gap-1.5">
              <Heatmap positions={positions} prices={prices} />
              <PnlChart snapshots={snapshots} />
            </div>
            <TradeBar selected={selected} onTrade={trade} />
            <div className="min-h-[120px] flex-[3]">
              <PositionsTable positions={positions} prices={prices} onSelect={setSelected} />
            </div>
          </div>
        </main>
        <ChatPanel messages={messages} loading={chatLoading} error={chatError} onSend={sendChat} />
      </div>
    </div>
  );
}
