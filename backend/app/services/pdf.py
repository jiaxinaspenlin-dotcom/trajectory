"""Safe PDF pitch-deck handling: validation, sanitized storage, text extraction.

Files are stored OUTSIDE any public/static directory with a random, sanitized
filename. Extraction is done with pypdf and never executes embedded content.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

from app.core.config import settings

PDF_MAGIC = b"%PDF-"


class PdfValidationError(Exception):
    pass


def sanitize_filename(name: str) -> str:
    """Strip path components and unsafe characters."""
    name = Path(name).name  # drop any directory traversal
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name[:120] or "upload.pdf"


def validate_pdf(filename: str, content: bytes, content_type: str) -> None:
    if len(content) == 0:
        raise PdfValidationError("Empty file.")
    if len(content) > settings.max_upload_bytes:
        raise PdfValidationError(
            f"File exceeds max upload size of {settings.max_upload_size_mb} MB."
        )
    if not filename.lower().endswith(".pdf"):
        raise PdfValidationError("Only .pdf files are accepted.")
    if content_type not in ("application/pdf", "application/octet-stream", ""):
        raise PdfValidationError(f"Unexpected content type: {content_type}.")
    if not content.startswith(PDF_MAGIC):
        raise PdfValidationError("File is not a valid PDF (bad header).")


def store_pdf(content: bytes, original_filename: str) -> tuple[str, Path]:
    """Store the PDF outside static dirs with a random name. Returns (name, path)."""
    safe = sanitize_filename(original_filename)
    stored = f"{secrets.token_hex(16)}_{safe}"
    dest = settings.upload_path / stored
    dest.write_bytes(content)
    return stored, dest


def extract_text(path: Path) -> tuple[str, list[dict], str | None]:
    """Extract per-page text. Returns (full_text, page_texts, error)."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        page_texts: list[dict] = []
        parts: list[str] = []
        for i, page in enumerate(reader.pages, start=1):
            try:
                txt = page.extract_text() or ""
            except Exception:  # noqa: BLE001
                txt = ""
            txt = txt.strip()
            page_texts.append({"page": i, "text": txt[:4000]})
            if txt:
                parts.append(txt)
        return "\n\n".join(parts)[:40000], page_texts, None
    except Exception as exc:  # noqa: BLE001
        return "", [], f"PDF extraction failed: {str(exc)[:200]}"
