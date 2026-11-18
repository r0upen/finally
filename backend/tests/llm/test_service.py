"""Action execution, prompt building and the chat flow."""

import pytest

from app.database import get_connection, insert_chat_message
from app.llm import service
from app.llm.schema import ChatResponse


def _response(trades=(), changes=()):
    return ChatResponse.model_validate(
        {"message": "m", "trades": list(trades), "watchlist_changes": list(changes)})


class TestExecuteActions:
    async def test_executed_trade_shape(self, fake_services):
        actions = await service.execute_actions(
            _response(trades=[{"ticker": "nvda", "side": "buy", "quantity": 5}]))
        assert actions == [{"type": "trade", "ticker": "NVDA", "side": "buy", "quantity": 5,
                            "status": "executed", "price": 100.0, "error": None}]

    async def test_failed_trade_shape(self, fake_services):
        actions = await service.execute_actions(
            _response(trades=[{"ticker": "ZZZZ", "side": "sell", "quantity": 1}]))
        assert actions == [{"type": "trade", "ticker": "ZZZZ", "side": "sell", "quantity": 1,
                            "status": "failed", "price": None,
                            "error": "No price available for ZZZZ"}]

    async def test_watchlist_results(self, fake_services):
        actions = await service.execute_actions(_response(changes=[
            {"ticker": "PYPL", "action": "add"},
            {"ticker": "AAPL", "action": "add"},
            {"ticker": "XYZ", "action": "remove"},
        ]))
        assert actions == [
            {"type": "watchlist", "ticker": "PYPL", "action": "add",
             "status": "executed", "error": None},
            {"type": "watchlist", "ticker": "AAPL", "action": "add",
             "status": "failed", "error": "Already on watchlist"},
            {"type": "watchlist", "ticker": "XYZ", "action": "remove",
             "status": "failed", "error": "Not on watchlist"},
        ]

    async def test_one_failure_does_not_stop_others(self, fake_services):
        actions = await service.execute_actions(_response(trades=[
            {"ticker": "ZZZZ", "side": "buy", "quantity": 1},
            {"ticker": "AAPL", "side": "buy", "quantity": 1},
        ]))
        assert [a["status"] for a in actions] == ["failed", "executed"]


class TestBuildMessages:
    def test_includes_context_history_and_actions(self, fake_services):
        history = [
            {"role": "user", "content": "buy 1 AAPL", "actions": None},
            {"role": "assistant", "content": "done",
             "actions": [{"type": "trade", "status": "failed", "error": "Insufficient cash"}]},
        ]
        messages = service.build_messages("next", history)
        assert messages[0]["content"] == service.SYSTEM_PROMPT
        assert "cash_balance" in messages[1]["content"] and "NVDA" in messages[1]["content"]
        assert messages[2] == {"role": "user", "content": "buy 1 AAPL"}
        assert "Insufficient cash" in messages[3]["content"]
        assert messages[-1] == {"role": "user", "content": "next"}


class TestHandleChat:
    async def test_stores_messages_and_actions(self, temp_db, fake_services, mock_llm):
        result = await service.handle_chat("buy 5 NVDA")
        assert result["message"] == "Mock mode: placing your buy order for 5 NVDA."
        assert result["actions"][0]["status"] == "executed"
        history = service.get_history()
        assert [(m["role"], m["content"]) for m in history] == [
            ("user", "buy 5 NVDA"), ("assistant", result["message"])]
        assert history[0]["actions"] is None
        assert history[1]["actions"] == result["actions"]

    async def test_history_limited_to_20(self, temp_db, fake_services, mock_llm, monkeypatch):
        with get_connection() as conn:
            for i in range(25):
                insert_chat_message(conn, "user", f"msg {i}", None)
        seen = {}

        async def fake_call(messages, user_message):
            seen["messages"] = messages
            return _response()
        monkeypatch.setattr(service, "call_llm", fake_call)
        await service.handle_chat("hello")
        # 2 system messages + 20 history + 1 new user message
        assert len(seen["messages"]) == 23
        assert seen["messages"][2]["content"] == "msg 5"

    async def test_llm_failure_stores_nothing(self, temp_db, fake_services, monkeypatch):
        from app.llm.client import LLMCallError

        async def fail(messages, user_message):
            raise LLMCallError("LLM call failed")
        monkeypatch.setattr(service, "call_llm", fail)
        with pytest.raises(LLMCallError):
            await service.handle_chat("hi")
        assert service.get_history() == []


def test_fakes_match_real_service_signatures(fake_services):
    """Fakes must be async exactly where the real services are."""
    import inspect

    from app.services import portfolio, watchlist

    for real, fake in [(portfolio, service.portfolio), (watchlist, service.watchlist)]:
        for name in ("execute_trade", "get_portfolio", "add_ticker", "remove_ticker",
                     "get_watchlist"):
            if hasattr(real, name):
                assert inspect.iscoroutinefunction(getattr(real, name)) == \
                    inspect.iscoroutinefunction(getattr(fake, name)), name
