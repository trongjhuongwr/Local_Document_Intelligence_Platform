"""Entrypoint: ``python -m mcp_server`` runs the read-only server on stdio."""

import logging
import sys

import structlog

from app.core.config import get_settings
from mcp_server.server import mcp


def _configure_stderr_logging(log_level: str) -> None:
    """Emit structlog JSON on stderr: stdout belongs to the MCP stdio transport."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stderr, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(sys.stderr),
        cache_logger_on_first_use=True,
    )


def main() -> None:
    _configure_stderr_logging(get_settings().log_level)
    structlog.get_logger(__name__).info("mcp_server_starting", transport="stdio")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
