"""LLM chat integration. Include `router` in the FastAPI app."""

from app.llm.routes import router

__all__ = ["router"]
