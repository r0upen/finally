// All data-testids used by the specs, in one place so renames are a one-line fix.
// Taken from the frontend source (frontend/components).
export const ids = {
  headerTotal: "total-value",
  headerCash: "cash-balance",
  connection: "connection-dot", // data-status="connected|reconnecting|disconnected"

  watchRow: (t: string) => `watchlist-row-${t}`,
  watchPrice: (t: string) => `price-${t}`,
  watchRemove: (t: string) => `remove-${t}`,
  watchAddInput: "watchlist-input",
  watchAddButton: "watchlist-add",
  watchError: "watchlist-error",

  mainChart: "main-chart",
  mainChartTicker: "main-chart-ticker", // text = selected ticker

  tradeTicker: "trade-ticker",
  tradeQty: "trade-quantity",
  tradeBuy: "trade-buy",
  tradeSell: "trade-sell",
  tradeError: "trade-error",
  tradeSuccess: "trade-success",

  positionsTable: "positions",
  positionRow: (t: string) => `position-row-${t}`,
  positionQty: (t: string) => `position-qty-${t}`, // en-US formatted, up to 4 decimals

  heatmap: "heatmap",
  heatmapCell: (t: string) => `heatmap-cell-${t}`, // data-pnl="profit|loss"
  pnlChart: "pnl-chart",

  chatInput: "chat-input",
  chatSend: "chat-send",
  chatLoading: "chat-loading",
  chatUserMsg: "chat-message-user",
  chatAssistantMsg: "chat-message-assistant",
  chatAction: "chat-action", // data-status="executed|failed", data-type="trade|watchlist"
  chatError: "chat-error",
};
