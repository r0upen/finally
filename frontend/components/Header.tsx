import type { ConnectionStatus } from "@/lib/types";
import { fmtSigned, fmtUsd, signClass } from "@/lib/format";

const DOT: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: "bg-up", label: "Live" },
  reconnecting: { color: "bg-accent", label: "Reconnecting" },
  disconnected: { color: "bg-down", label: "Disconnected" },
};

interface Props {
  totalValue: number | null;
  cash: number | null;
  pnl: number | null;
  status: ConnectionStatus;
}

export default function Header({ totalValue, cash, pnl, status }: Props) {
  const dot = DOT[status];
  return (
    <header className="flex h-14 shrink-0 items-center gap-8 border-b border-line bg-panel px-4">
      <div className="text-[17px] font-semibold tracking-tight text-bright">
        Fin<span className="text-accent">Ally</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-muted">Portfolio</span>
        <span data-testid="total-value" className="num text-[20px] font-medium text-bright">
          {totalValue == null ? "--" : fmtUsd(totalValue)}
        </span>
        {pnl != null && (
          <span data-testid="header-pnl" className={`num ${signClass(pnl)}`}>
            {fmtSigned(pnl)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-muted">Cash</span>
        <span data-testid="cash-balance" className="num text-[15px] text-bright">
          {cash == null ? "--" : fmtUsd(cash)}
        </span>
      </div>
      <div
        className="ml-auto flex items-center gap-2 text-muted"
        title={`Price stream: ${dot.label}`}
      >
        <span
          data-testid="connection-dot"
          data-status={status}
          className={`h-2 w-2 rounded-full ${dot.color}`}
        />
        <span data-testid="connection-label">{dot.label}</span>
      </div>
    </header>
  );
}
