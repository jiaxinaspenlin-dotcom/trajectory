"""URL validation & SSRF protection for any user-supplied URL we might fetch."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_SCHEMES = {"file", "ftp", "gopher", "data"}


class UnsafeURLError(Exception):
    pass


def validate_public_url(url: str) -> str:
    """Validate a URL is http(s) and does not resolve to a private/loopback host.

    Used before any server-side fetch of a user-provided company website etc.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError("Only http/https URLs are allowed.")
    if parsed.scheme in _BLOCKED_SCHEMES:
        raise UnsafeURLError("Blocked URL scheme.")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL has no host.")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Host could not be resolved: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise UnsafeURLError("URL resolves to a private/reserved address (SSRF blocked).")
    return url


def parse_github_repo_url(url: str) -> tuple[str, str] | None:
    """Extract (owner, repo) from a github repo URL, or None."""
    parsed = urlparse(url)
    if "github.com" not in (parsed.netloc or ""):
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2:
        return parts[0], parts[1].removesuffix(".git")
    return None
