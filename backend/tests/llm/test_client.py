"""Schema parsing, mock mode and the (mocked) LiteLLM call."""

from types import SimpleNamespace

import pytest

from app.llm import client
from app.llm.client import LLMCallError, LLMNotConfiguredError, call_llm, mock_response
from app.llm.schema import ChatResponse


def _fake_completion(content):
    async def fake(**kwargs):
        fake.kwargs = kwargs
        message = SimpleNamespace(content=content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])
    return fake


class TestParseResponse:
    def test_full_response(self):
        raw = ('{"message": "ok", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 2.5}],'
               ' "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}')
        result = client.parse_response(raw)
        assert result.message == "ok"
        assert result.trades[0].quantity == 2.5
        assert result.watchlist_changes[0].action == "add"

    def test_empty_arrays(self):
        result = client.parse_response('{"message": "hi", "trades": [], "watchlist_changes": []}')
        assert result.trades == [] and result.watchlist_changes == []

    @pytest.mark.parametrize("raw", [
        None,
        "",
        "not json",
        '{"message": "hi"}',
        '{"message": "hi", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}],'
        ' "watchlist_changes": []}',
        '{"message": "hi", "trades": [], "watchlist_changes": [{"ticker": "X", "action": "drop"}]}',
        '{"message": "hi", "trades": [], "watchlist_changes": [], "extra": 1}',
    ])
    def test_malformed_raises(self, raw):
        with pytest.raises(LLMCallError):
            client.parse_response(raw)

    def test_schema_is_strict(self):
        schema = ChatResponse.model_json_schema()
        assert set(schema["required"]) == {"message", "trades", "watchlist_changes"}
        assert schema["additionalProperties"] is False


class TestMockResponse:
    @pytest.mark.parametrize("text,side,qty,ticker", [
        ("buy 5 AAPL", "buy", 5, "AAPL"),
        ("Please SELL 2 nvda now", "sell", 2, "NVDA"),
        ("Buy 0.5 tsla", "buy", 0.5, "TSLA"),
    ])
    def test_trade_messages(self, text, side, qty, ticker):
        result = mock_response(text)
        assert result.trades[0].model_dump() == {"ticker": ticker, "side": side, "quantity": qty}
        assert result.watchlist_changes == []
        assert result.message == f"Mock mode: placing your {side} order for {qty} {ticker}."

    def test_other_message(self):
        result = mock_response("How is my portfolio?")
        assert result.message == client.MOCK_DEFAULT_MESSAGE
        assert result.trades == [] and result.watchlist_changes == []

    def test_deterministic(self):
        assert mock_response("buy 5 AAPL") == mock_response("buy 5 AAPL")


class TestCallLLM:
    async def test_mock_mode_skips_network(self, monkeypatch):
        monkeypatch.setenv("LLM_MOCK", "true")
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.setattr(client, "acompletion", _fake_completion(None))
        assert (await call_llm([], "buy 1 AAPL")).trades[0].ticker == "AAPL"

    async def test_missing_key(self, monkeypatch):
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        with pytest.raises(LLMNotConfiguredError, match="set OPENROUTER_API_KEY or LLM_MOCK=true"):
            await call_llm([], "hi")

    async def test_real_call_uses_structured_output(self, monkeypatch):
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        fake = _fake_completion('{"message": "hi", "trades": [], "watchlist_changes": []}')
        monkeypatch.setattr(client, "acompletion", fake)
        assert (await call_llm([{"role": "user", "content": "hi"}], "hi")).message == "hi"
        assert fake.kwargs["model"] == client.MODEL
        assert fake.kwargs["response_format"] is ChatResponse
        assert fake.kwargs["extra_body"] == {"provider": {"order": ["cerebras"]}}

    async def test_call_exception_becomes_call_error(self, monkeypatch):
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        async def boom(**kwargs):
            raise RuntimeError("timeout")
        monkeypatch.setattr(client, "acompletion", boom)
        with pytest.raises(LLMCallError):
            await call_llm([], "hi")

    async def test_unparseable_output(self, monkeypatch):
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        monkeypatch.setattr(client, "acompletion", _fake_completion("sorry, no JSON"))
        with pytest.raises(LLMCallError):
            await call_llm([], "hi")
