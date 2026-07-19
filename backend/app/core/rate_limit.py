"""Minimal in-memory sliding-window rate limiter for expensive AI endpoints.

For production behind multiple workers this should move to Redis; documented as
a known limitation. Fine for a single-process deployment.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import settings

_buckets: dict[str, deque[float]] = defaultdict(deque)


def ai_rate_limit(request: Request) -> None:
    """FastAPI dependency: throttle AI endpoints per client IP per minute."""
    limit = settings.ai_rate_limit_per_minute
    if limit <= 0:
        return
    key = request.client.host if request.client else "anon"
    now = time.time()
    window = _buckets[key]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"AI rate limit exceeded ({limit}/min). Please retry shortly.",
        )
    window.append(now)
