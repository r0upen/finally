import { fmtPrice, fmtQty } from "@/lib/format";
import type { ChatAction } from "@/lib/types";

function describe(a: ChatAction): string {
  if (a.type === "trade") {
    const verb = a.side === "sell" ? "Sell" : "Buy";
    const at = a.status === "executed" && a.price != null ? ` at $${fmtPrice(a.price)}` : "";
    return `${verb} ${fmtQty(a.quantity ?? 0)} ${a.ticker}${at}`;
  }
  return `${a.action === "remove" ? "Remove" : "Add"} ${a.ticker} ${a.action === "remove" ? "from" : "to"} watchlist`;
}

export default function ChatActions({ actions }: { actions: ChatAction[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {actions.map((a, i) => {
        const ok = a.status === "executed";
        return (
          <li
            key={i}
            data-testid="chat-action"
            data-status={a.status}
            data-type={a.type}
            className={`border px-2 py-1 text-[12px] ${ok ? "border-up/40 text-up" : "border-down/40 text-down"}`}
          >
            <span className="num">{describe(a)}</span>
            <span className="text-muted"> {ok ? "done" : "failed"}</span>
            {!ok && a.error && <span className="block text-down">{a.error}</span>}
          </li>
        );
      })}
    </ul>
  );
}
