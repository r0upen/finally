"""Portfolio routes: /api/portfolio, /api/portfolio/trade, /api/portfolio/history."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection, list_snapshots
from app.services.portfolio import TradeError, execute_trade, get_portfolio

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class TradeRequest(BaseModel):
    ticker: str
    quantity: float
    side: str


@router.get("")
def portfolio() -> dict:
    return get_portfolio()


@router.post("/trade")
async def trade(req: TradeRequest) -> dict:
    try:
        return await execute_trade(req.ticker, req.side, req.quantity)
    except TradeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/history")
def history() -> list[dict]:
    with get_connection() as conn:
        return list_snapshots(conn)
