"""Watchlist routes: GET/POST /api/watchlist, DELETE /api/watchlist/{ticker}."""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.services.watchlist import WatchlistError, add_ticker, get_watchlist, remove_ticker

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class AddTickerRequest(BaseModel):
    ticker: str


@router.get("")
def watchlist() -> list[dict]:
    return get_watchlist()


@router.post("", status_code=201)
async def add(req: AddTickerRequest) -> dict:
    try:
        return {"ticker": await add_ticker(req.ticker)}
    except WatchlistError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None


@router.delete("/{ticker}", status_code=204)
async def remove(ticker: str) -> Response:
    try:
        await remove_ticker(ticker)
    except WatchlistError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
    return Response(status_code=204)
