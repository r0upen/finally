"""LLM calls: real (LiteLLM -> OpenRouter -> Cerebras) and deterministic mock."""

import os
import re

from litellm import acompletion

from app.llm.schema import ChatResponse, TradeInstruction

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

MOCK_TRADE_MESSAGE = "Mock mode: placing your {side} order for {quantity} {ticker}."
MOCK_DEFAULT_MESSAGE = "Mock mode: I am FinAlly, your AI trading assistant. No actions taken."

_MOCK_PATTERN = re.compile(r"\b(buy|sell)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{1,5})\b", re.IGNORECASE)


class LLMNotConfiguredError(Exception):
    """OPENROUTER_API_KEY is missing and mock mode is off."""


class LLMCallError(Exception):
    """The LLM call failed or returned output that does not match the schema."""


def is_mock_mode() -> bool:
    return os.environ.get("LLM_MOCK", "").strip().lower() == "true"


def mock_response(user_message: str) -> ChatResponse:
    """Deterministic response: 'buy|sell N TICKER' yields one trade, else nothing."""
    match = _MOCK_PATTERN.search(user_message)
    if not match:
        return ChatResponse(message=MOCK_DEFAULT_MESSAGE, trades=[], watchlist_changes=[])
    side = match.group(1).lower()
    quantity = float(match.group(2))
    ticker = match.group(3).upper()
    shown_qty = int(quantity) if quantity.is_integer() else quantity
    return ChatResponse(
        message=MOCK_TRADE_MESSAGE.format(side=side, quantity=shown_qty, ticker=ticker),
        trades=[TradeInstruction(ticker=ticker, side=side, quantity=quantity)],
        watchlist_changes=[],
    )


def parse_response(content: str | None) -> ChatResponse:
    """Validate raw LLM JSON against the schema; raise LLMCallError if it does not fit."""
    if not content:
        raise LLMCallError("LLM returned an empty response")
    try:
        return ChatResponse.model_validate_json(content)
    except ValueError as exc:
        raise LLMCallError("LLM returned unparseable output") from exc


async def call_llm(messages: list[dict], user_message: str) -> ChatResponse:
    """Return a structured response, from the mock or the real model."""
    if is_mock_mode():
        return mock_response(user_message)
    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        raise LLMNotConfiguredError("LLM not configured: set OPENROUTER_API_KEY or LLM_MOCK=true")
    try:
        response = await acompletion(
            model=MODEL,
            messages=messages,
            response_format=ChatResponse,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
        )
        content = response.choices[0].message.content
    except Exception as exc:
        raise LLMCallError(f"LLM call failed: {type(exc).__name__}") from exc
    return parse_response(content)
