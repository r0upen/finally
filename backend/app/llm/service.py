"""Chat flow: build prompt, call LLM, auto-execute actions, store messages."""

import json

from app.database import get_connection, insert_chat_message, list_chat_messages
from app.llm.client import call_llm
from app.llm.schema import ChatResponse
from app.services import portfolio, watchlist

HISTORY_LIMIT = 20

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant in a simulated trading workstation.
The money is virtual. You can:
- Analyze portfolio composition, risk concentration and P&L.
- Suggest trades with brief reasoning.
- Execute trades when the user asks or agrees, by listing them in "trades"
  (market orders only; quantity > 0; side "buy" or "sell").
- Manage the watchlist proactively via "watchlist_changes" (action "add" or "remove").
Be concise and data-driven. Only trade tickers that are on the watchlist or held.
Always respond with valid JSON containing "message", "trades" and "watchlist_changes";
use empty arrays when there is nothing to do.
Earlier assistant turns may include [Action results]: these show what actually executed or failed."""


def build_context() -> str:
    """Current portfolio and watchlist (with live prices) as JSON text."""
    context = {"portfolio": portfolio.get_portfolio(), "watchlist": watchlist.get_watchlist()}
    return "Current portfolio and watchlist:\n" + json.dumps(context, indent=2)


def _history_messages(history: list[dict]) -> list[dict]:
    messages = []
    for row in history:
        content = row["content"]
        if row["role"] == "assistant" and row.get("actions"):
            content += "\n[Action results] " + json.dumps(row["actions"])
        messages.append({"role": row["role"], "content": content})
    return messages


def build_messages(user_message: str, history: list[dict]) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": build_context()},
        *_history_messages(history),
        {"role": "user", "content": user_message},
    ]


async def _run_trade(ticker: str, side: str, quantity: float) -> dict:
    result = {"type": "trade", "ticker": ticker.upper(), "side": side, "quantity": quantity}
    try:
        trade = (await portfolio.execute_trade(ticker, side, quantity))["trade"]
    except portfolio.TradeError as exc:
        return {**result, "status": "failed", "price": None, "error": str(exc)}
    return {**result, "ticker": trade["ticker"], "status": "executed",
            "price": trade["price"], "error": None}


async def _run_watchlist(ticker: str, action: str) -> dict:
    result = {"type": "watchlist", "ticker": ticker.upper(), "action": action}
    try:
        if action == "add":
            await watchlist.add_ticker(ticker)
        else:
            await watchlist.remove_ticker(ticker)
    except watchlist.WatchlistError as exc:
        return {**result, "status": "failed", "error": str(exc)}
    return {**result, "status": "executed", "error": None}


async def execute_actions(response: ChatResponse) -> list[dict]:
    """Run trades then watchlist changes; one result per action, failures included."""
    actions = [await _run_trade(t.ticker, t.side, t.quantity) for t in response.trades]
    actions += [await _run_watchlist(w.ticker, w.action) for w in response.watchlist_changes]
    return actions


async def handle_chat(user_message: str) -> dict:
    """Full chat turn. Raises client errors before anything is stored."""
    with get_connection() as conn:
        history = list_chat_messages(conn, limit=HISTORY_LIMIT)
    response = await call_llm(build_messages(user_message, history), user_message)
    actions = await execute_actions(response)
    with get_connection() as conn:
        insert_chat_message(conn, "user", user_message, None)
        insert_chat_message(conn, "assistant", response.message, actions)
    return {"message": response.message, "actions": actions}


def get_history() -> list[dict]:
    with get_connection() as conn:
        return list_chat_messages(conn)
