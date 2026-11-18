"""Background task that records a portfolio snapshot every 30 seconds."""

import asyncio
import logging

from .portfolio import record_snapshot

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 30.0


async def snapshot_loop(interval: float = SNAPSHOT_INTERVAL) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            record_snapshot()
        except Exception:
            logger.exception("Portfolio snapshot failed")
