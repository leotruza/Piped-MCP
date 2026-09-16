"""Dynamic TeamPiped instance discovery and in-memory health manager."""
from __future__ import annotations
import logging, re, time
from urllib.parse import urlparse
from .models import Config, InstanceState, NoHealthyInstances

log = logging.getLogger(__name__)
URL_RE = re.compile(r"https?://[^\s|<>]+", re.I)

def derive_frontend_url(api_url: str) -> str:
    parsed = urlparse(api_url)
    host = parsed.netloc
    for prefix in ("pipedapi-libre.", "pipedapi.", "piped-api.", "api.piped.", "api."):
        if host.startswith(prefix):
            host = host[len(prefix):]
            break
    return f"https://{host}"

def parse_instances(markdown: str) -> list[tuple[str, bool, str]]:
    """Parse API URLs from TeamPiped's Markdown table, preserving CDN flags."""
    found: dict[str, tuple[bool, str]] = {}
    for line in markdown.splitlines():
        if "http" not in line.lower() or line.lstrip().startswith("<!--"):
            continue
        urls = URL_RE.findall(line)
        is_cdn = bool(re.search(r"\bcdn\b|\byes\b", line, re.I))
        for raw in urls:
            url = raw.rstrip("`),.;")
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                continue
            if "registered/badge" in parsed.path.lower():
                continue
            # The table can contain frontend links; API rows are identified by api.
            if any(token in (parsed.path + parsed.netloc).lower() for token in ("pipedapi", "api")):
                base = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
                old_cdn, frontend = found.get(base, (False, derive_frontend_url(base)))
                found[base] = (old_cdn or is_cdn, frontend)
    return [(url, cdn, frontend) for url, (cdn, frontend) in found.items()]

class InstanceManager:
    def __init__(self, config: Config, transport=None):
        self.config, self.transport = config, transport
        self.instances: dict[str, InstanceState] = {}
        self.last_list_refresh: float | None = None

    def load_markdown(self, markdown: str) -> int:
        for url, cdn, frontend in parse_instances(markdown):
            existing = self.instances.get(url)
            if existing:
                existing.cdn = existing.cdn or cdn
            else:
                self.instances[url] = InstanceState(url=url, cdn=cdn, frontend=frontend)
        self.last_list_refresh = time.time()
        log.info("Loaded %d public instances", len(self.instances))
        return len(self.instances)

    async def refresh(self) -> int:
        response = await self._request("GET", self.config.instance_list_url)
        if response.status_code >= 400:
            raise RuntimeError(f"instance list returned HTTP {response.status_code}")
        return self.load_markdown(response.text)

    async def health_check(self, state: InstanceState) -> bool:
        started = time.perf_counter()
        try:
            response = await self._request("GET", f"{state.url}/search", params={"q":"test", "filter":"all"})
            payload = response.json()
            valid = response.status_code < 400 and isinstance(payload, dict) and isinstance(payload.get("items"), list)
            if not valid: raise ValueError("unexpected Piped search response")
            state.healthy, state.consecutive_failures = True, 0
            state.latency_ms, state.last_success = (time.perf_counter()-started)*1000, time.time()
            state.last_health_check = time.time()
            return True
        except Exception as exc:
            state.healthy = False
            state.failure_count += 1
            state.consecutive_failures += 1
            state.last_health_check = time.time()
            log.warning("Health check failed for %s: %s", state.url, exc)
            return False

    async def health_check_all(self) -> int:
        count = 0
        for state in self.instances.values():
            count += await self.health_check(state)
        log.info("%d instances passed health checks", count)
        return count

    def select(self, exclude: set[str] | None = None) -> InstanceState:
        exclude = exclude or set()
        candidates = [s for s in self.instances.values() if s.healthy and s.url not in exclude]
        if not candidates: raise NoHealthyInstances()
        return min(candidates, key=lambda s: (not s.cdn, s.consecutive_failures, s.latency_ms or 1e9, s.failure_count))

    def mark_failure(self, url: str) -> None:
        state = self.instances.get(url)
        if state:
            state.healthy = False
            state.failure_count += 1
            state.consecutive_failures += 1

    async def _request(self, method: str, url: str, **kwargs):
        if self.transport is not None:
            return await self.transport.request(method, url, timeout=self.config.request_timeout_seconds, **kwargs)
        import httpx
        async with httpx.AsyncClient(timeout=self.config.request_timeout_seconds, follow_redirects=True) as client:
            return await client.request(method, url, **kwargs)
