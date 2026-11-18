"""Structured output schema for the LLM (PLAN Section 9)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class TradeInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    action: Literal["add", "remove"]


class ChatResponse(BaseModel):
    """What the LLM must return. All fields required (strict mode)."""

    model_config = ConfigDict(extra="forbid")

    message: str
    trades: list[TradeInstruction]
    watchlist_changes: list[WatchlistChange]
