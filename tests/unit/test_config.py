from app.core.config import Settings


def test_default_settings() -> None:
    settings = Settings(_env_file=None)
    assert settings.ollama_llm_model == "llama3.2:1b"
    assert settings.ollama_embedding_model == "all-minilm"
    assert settings.ollama_num_ctx == 4096
    assert settings.enable_reranker is False
    assert settings.default_retrieval_mode == "bm25"


def test_settings_read_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("OLLAMA_LLM_MODEL", "llama3.2:3b")
    monkeypatch.setenv("ENABLE_RERANKER", "true")
    settings = Settings(_env_file=None)
    assert settings.ollama_llm_model == "llama3.2:3b"
    assert settings.enable_reranker is True
