"""Chat API routes (PLAN Section 8)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.llm import service
from app.llm.client import LLMCallError, LLMNotConfiguredError

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


@router.post("/api/chat")
async def chat(request: ChatRequest) -> dict:
    try:
        return await service.handle_chat(request.message)
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/api/chat/history")
def chat_history() -> list[dict]:
    return service.get_history()
