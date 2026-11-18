# Frontend test IDs

Stable `data-testid` attributes for Playwright. `{T}` is an uppercase ticker.

## Header
| testid | Element | Notes |
|---|---|---|
| `total-value` | Live portfolio total | Text like `$10,000.00`; `--` before first load |
| `header-pnl` | Unrealized P&L | Signed, e.g. `+$12.30` |
| `cash-balance` | Cash balance | Text like `$10,000.00` |
| `connection-dot` | Status dot | Attribute `data-status` = `connected` / `reconnecting` / `disconnected` |
| `connection-label` | Status text | `Live` / `Reconnecting` / `Disconnected` |

## Watchlist
| testid | Element |
|---|---|
| `watchlist` | Panel |
| `watchlist-row-{T}` | Row (click selects ticker; `aria-selected="true"` when selected) |
| `price-{T}` | Price cell; has class `flash-up` / `flash-down` for ~500ms after a change; `--` until first price |
| `change-{T}` | Chg % since page load |
| `remove-{T}` | Remove button (visible on hover; clickable via `force` or focus) |
| `watchlist-input` | Add-ticker input |
| `watchlist-add` | Add button (form submit; Enter also works) |
| `watchlist-error` | Error text from backend `detail` (400/409/404) |

## Main chart
| testid | Element |
|---|---|
| `main-chart` | Panel |
| `main-chart-ticker` | Selected ticker symbol |

## Trade bar
| testid | Element |
|---|---|
| `trade-bar` | Form |
| `trade-ticker` | Ticker input (pre-filled with selected ticker) |
| `trade-quantity` | Quantity input |
| `trade-buy` | Buy button |
| `trade-sell` | Sell button |
| `trade-success` | Confirmation, e.g. `Bought 5 AAPL` |
| `trade-error` | Error text from backend `detail`, e.g. `Insufficient cash: ...` |

## Portfolio
| testid | Element |
|---|---|
| `positions` | Positions panel |
| `position-row-{T}` | Position row |
| `position-qty-{T}` | Quantity cell |
| `position-pnl-{T}` | Unrealized P&L cell |
| `positions-empty` | Empty-state text when no positions |
| `heatmap` | Heatmap panel |
| `heatmap-cell-{T}` | SVG `<g>` per position; attribute `data-pnl` = `profit` / `loss` |
| `pnl-chart` | P&L chart panel (contains a Recharts `svg` with `.recharts-line` once snapshots exist) |

## Chat
| testid | Element |
|---|---|
| `chat-panel` | Panel (absent when collapsed) |
| `chat-toggle` | Collapse / expand button |
| `chat-messages` | Scrolling message list |
| `chat-message-user` / `chat-message-assistant` | One per message |
| `chat-input` | Message input |
| `chat-send` | Send button (Enter also submits) |
| `chat-loading` | Visible while awaiting `POST /api/chat` |
| `chat-error` | Error text (502/503 `detail`) |
| `chat-action` | One per action result; attributes `data-status` = `executed` / `failed`, `data-type` = `trade` / `watchlist`. Failed actions include the error text. |
