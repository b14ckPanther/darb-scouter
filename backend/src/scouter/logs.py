"""Logging setup shared by the API and the scheduler."""

import logging

# httpx logs every request URL at INFO, and Telegram's URL carries the bot token
_QUIET = ("httpx", "httpcore")


def configure_logging(level: int = logging.INFO) -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for name in _QUIET:
        logging.getLogger(name).setLevel(logging.WARNING)
