"""Dynamic TeamPiped instance discovery and in-memory health manager."""
from __future__ import annotations
import asyncio, logging, re, time
from urllib.parse import urlparse
from .models import Config, InstanceState, NoHealthyInstances

log = logging.getLogger(__name__)
API_HOST_RE = re.compile(r"^(?:pipedapi(?:-libre)?|piped-api)\.|^api\.piped\.", re.I)
URL_RE = re.compile(r"https?://[^\s|<>]+", re.I)

def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]

def parse_instances(markdown: str) -> list[tuple[str, bool]]:
    """Parse only the API URL column from TeamPiped's official Markdown table."""
    lines = markdown.splitlines(); api_index = None; header_index = None
    for index, line in enumerate(lines):
        cells = [cell.lower() for cell in _cells(line)]
        if "instance api url" in cells:
            api_index, header_index = cells.index("instance api url"), index
            break
    if api_index is None: return []
    found: dict[str, bool] = {}
    for line in lines[header_index + 2:]:
        cells = _cells(line)
        if len(cells) <= api_index: continue
        raw_match = URL_RE.search(cells[api_index])
        if not raw_match: continue
        parsed = urlparse(raw_match.group(0).rstrip("`),.;"))
        if parsed.scheme != "https" or not parsed.netloc or not API_HOST_RE.search(parsed.hostname or ""): continue
        base = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
        found[base] = found.get(base, False) or bool(re.search(r"\bcdn\b|\byes\b", line, re.I))
    return list(found.items())

class InstanceManager:
    def __init__(self, config: Config, transport=None):
        self.config, self.transport = config, transport
        self.instances: dict[str, InstanceState] = {}; self.last_list_refresh: float | None = None

    def load_markdown(self, markdown: str) -> int:
        for url, cdn in parse_instances(markdown):
            existing = self.instances.get(url)
            if existing: existing.cdn = existing.cdn or cdn
            else: self.instances[url] = InstanceState(url=url, cdn=cdn)
        self.last_list_refresh = time.time(); log.info("Loaded %d public instances", len(self.instances)); return len(self.instances)

    async def refresh(self) -> int:
        response = await self._request("GET", self.config.instance_list_url)
        if response.status_code >= 400: raise RuntimeError(f"instance list returned HTTP {response.status_code}")
        return self.load_markdown(response.text)

    async def health_check(self, state: InstanceState) -> bool:
        started = time.perf_counter()
        try:
            response = await self._request("GET", f"{state.url}/search", params={"q":"test", "filter":"all"})
            payload = response.json(); valid = response.status_code < 400 and isinstance(payload, dict) and isinstance(payload.get("items"), list)
            if not valid: raise ValueError("unexpected Piped search response")
            state.healthy, state.consecutive_failures = True, 0; state.latency_ms = (time.perf_counter()-started)*1000
            state.last_success = state.last_health_check = time.time(); return True
        except Exception as exc:
            state.healthy = False; state.failure_count += 1; state.consecutive_failures += 1; state.last_health_check = time.time()
            log.warning("Health check failed for %s: %s", state.url, exc); return False

    async def health_check_all(self) -> int:
        results = await asyncio.gather(*(self.health_check(state) for state in self.instances.values()), return_exceptions=False)
        count = sum(results); log.info("%d instances passed health checks", count); return count

    def select(self, exclude: set[str] | None = None) -> InstanceState:
        candidates = [s for s in self.instances.values() if s.healthy and s.url not in (exclude or set())]
        if not candidates: raise NoHealthyInstances()
        return min(candidates, key=lambda s: (not s.cdn, s.consecutive_failures, s.latency_ms or 1e9, s.failure_count))

    def mark_failure(self, url: str) -> None:
        state = self.instances.get(url)
        if state: state.healthy = False; state.failure_count += 1; state.consecutive_failures += 1

    async def _request(self, method: str, url: str, **kwargs):
        if self.transport is not None: return await self.transport.request(method, url, timeout=self.config.request_timeout_seconds, **kwargs)
        import httpx
        async with httpx.AsyncClient(timeout=self.config.request_timeout_seconds, follow_redirects=True) as client: return await client.request(method, url, **kwargs)
