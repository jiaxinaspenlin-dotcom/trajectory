"""AI provider abstraction.

Designed so another provider can be added later without rewriting the app: the
rest of the codebase depends only on `AIProvider.generate_json(...)`.

The only implemented provider is Anthropic (official SDK). When no API key is
configured, `AIProvider.enabled` is False and callers fall back to deterministic,
evidence-only results — the app still works end-to-end and never invents facts.

Rules enforced here:
- API key is loaded from the environment; never logged, never sent to the client.
- All calls run on the backend only.
- Timeouts + retries + structured JSON parsing validated by callers via Pydantic.
- Hidden chain-of-thought is never requested or returned; we ask only for
  final structured conclusions.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger("trajectory.ai")


class AIError(Exception):
    pass


class AIProvider:
    """Thin wrapper over the Anthropic Messages API returning parsed JSON."""

    def __init__(self) -> None:
        self._client: Any = None
        self.model = settings.anthropic_model
        self.enabled = settings.ai_enabled

    def _client_lazy(self) -> Any:
        if self._client is None:
            import anthropic  # imported lazily so tests run without network

            self._client = anthropic.Anthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.ai_timeout_seconds,
                max_retries=0,  # we handle retries explicitly
            )
        return self._client

    def generate_json(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int = 2000,
        retries: int = 2,
    ) -> dict[str, Any]:
        """Call the model and return parsed JSON.

        Raises AIError on failure so the caller can apply its deterministic
        fallback. Never raises the raw provider exception to callers.
        """
        if not self.enabled:
            raise AIError("AI provider disabled (no ANTHROPIC_API_KEY configured).")

        guard = (
            "\n\nRespond with a SINGLE valid JSON object and nothing else. "
            "Do not include markdown fences, prose, or explanations outside the JSON. "
            "Do not reveal step-by-step reasoning; return only final structured "
            "conclusions. Never invent facts, citations, URLs, metrics, or evidence "
            "IDs. Only reference evidence IDs that appear in the provided context."
        )
        last_err: Exception | None = None
        for attempt in range(retries + 1):
            try:
                client = self._client_lazy()
                t0 = time.time()
                resp = client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=system + guard,
                    messages=[{"role": "user", "content": user}],
                )
                elapsed = round(time.time() - t0, 2)
                text = "".join(
                    block.text for block in resp.content if getattr(block, "type", "") == "text"
                )
                data = _extract_json(text)
                # Log metadata only — never the key, never full evidence.
                logger.info(
                    "ai_call ok model=%s tokens_in=%s tokens_out=%s elapsed=%ss",
                    self.model,
                    getattr(resp.usage, "input_tokens", "?"),
                    getattr(resp.usage, "output_tokens", "?"),
                    elapsed,
                )
                return data
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                logger.warning("ai_call failed attempt=%d err=%s", attempt, str(exc)[:200])
                time.sleep(0.6 * (2**attempt))
        raise AIError(f"AI call failed after retries: {str(last_err)[:200]}")


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise AIError("Model did not return valid JSON.") from None


# module-level singleton
provider = AIProvider()
