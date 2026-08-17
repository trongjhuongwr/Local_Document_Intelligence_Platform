.PHONY: install lint format typecheck test test-all up down api ui

install:
	pip install -e ".[dev]"

lint:
	ruff check .
	ruff format --check .

format:
	ruff check --fix .
	ruff format .

typecheck:
	mypy app

test:
	pytest -m "not ollama and not integration" -q

test-all:
	pytest -q

up:
	docker compose up -d postgres

down:
	docker compose down

api:
	uvicorn app.api.main:app --reload
