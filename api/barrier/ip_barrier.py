from __future__ import annotations

import logging
import socket
from urllib.parse import urlparse

import requests

from .base import BarrierController

logger = logging.getLogger(__name__)


def _tcp_reachable(url: str, timeout: float = 2.0) -> bool:
    """
    Check TCP connectivity to the barrier host without issuing the open HTTP request.

    Calling GET on the open URL during health checks would trigger the gate.
    """
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return False
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


class IPBarrierController(BarrierController):
    """HTTP GET trigger for network-addressable barrier controllers."""

    def __init__(self, url: str, timeout_sec: float = 3.0) -> None:
        self._url = url.strip()
        self._timeout = timeout_sec

    def open(self, duration_sec: float | None = None) -> bool:
        _ = duration_sec  # IP barriers ignore pulse duration
        if not self._url:
            logger.warning("IP barrier: empty URL — open skipped")
            return False
        try:
            resp = requests.get(self._url, timeout=self._timeout)
            resp.raise_for_status()
            logger.info(
                "IP barrier open OK %s status=%s",
                self._url,
                resp.status_code,
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("IP barrier open failed: %s", exc)
            return False

    def is_connected(self) -> bool:
        if not self._url:
            return False
        return _tcp_reachable(self._url, timeout=2.0)

    def close(self) -> None:
        return
