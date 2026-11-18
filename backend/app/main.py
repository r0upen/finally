"""FastAPI application: API routes, SSE stream, background tasks, static frontend."""

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

BACKEND_DIR = Path(__file__).resolve().parents[1]
# Load <project root>/.env before importing modules that read env vars.
# Real environment variables take precedence (override=False).
load_dotenv(BACKEND_DIR.parent / ".env", override=False)

from app.api.portfolio import router as portfolio_router  # noqa: E402
from app.api.watchlist import router as watchlist_router  # noqa: E402
from app.database import init_db  # noqa: E402
from app.llm import router as chat_router  # noqa: E402
from app.market import create_stream_router  # noqa: E402
from app.services import market  # noqa: E402
from app.services.portfolio import record_snapshot  # noqa: E402
from app.services.snapshots import snapshot_loop  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    await market.start()
    record_snapshot()
    task = asyncio.create_task(snapshot_loop(), name="snapshot-loop")
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await market.stop()


app = FastAPI(title="FinAlly", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(portfolio_router)
app.include_router(watchlist_router)
app.include_router(chat_router)
app.include_router(create_stream_router(market.price_cache))

# Static frontend last, so the catch-all mount does not shadow /api routes.
STATIC_DIR = Path(os.environ.get("STATIC_DIR") or BACKEND_DIR / "static")
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
