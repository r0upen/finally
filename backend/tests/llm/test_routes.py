"""HTTP status codes and response shapes for the chat endpoints."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.llm import router


@pytest.fixture
def http(temp_db, fake_services):
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_chat_mock_trade(http, mock_llm):
    resp = http.post("/api/chat", json={"message": "buy 5 NVDA"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"] == "Mock mode: placing your buy order for 5 NVDA."
    assert body["actions"][0]["type"] == "trade"
    assert body["actions"][0]["status"] == "executed"


def test_history_after_chat(http, mock_llm):
    http.post("/api/chat", json={"message": "hello"})
    resp = http.get("/api/chat/history")
    assert resp.status_code == 200
    body = resp.json()
    assert [m["role"] for m in body] == ["user", "assistant"]
    assert set(body[0]) == {"role", "content", "actions", "created_at"}


def test_missing_key_returns_503(http, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    resp = http.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 503
    assert resp.json() == {"detail": "LLM not configured: set OPENROUTER_API_KEY or LLM_MOCK=true"}


def test_bad_llm_output_returns_502(http, monkeypatch):
    from app.llm import client
    from tests.llm.test_client import _fake_completion

    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(client, "acompletion", _fake_completion("garbage"))
    resp = http.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 502
    assert http.get("/api/chat/history").json() == []


@pytest.mark.parametrize("body", [{}, {"message": ""}, {"msg": "hi"}])
def test_malformed_body_returns_422(http, mock_llm, body):
    assert http.post("/api/chat", json=body).status_code == 422
