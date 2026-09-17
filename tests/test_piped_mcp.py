import pytest
from urllib.parse import parse_qs, urlparse
from src.models import Config
from src.instances import parse_instances, InstanceManager
from src.piped import PipedClient

TABLE = """Instance Name | Instance API URL | Instance Location(s) | CDN
--- | --- | --- | ---
one | https://pipedapi.one | US | Yes
two | https://pipedapi.two | DE | No"""
class Response:
    def __init__(self, payload, status_code=200, text=""): self._payload, self.status_code, self.text = payload, status_code, text
    def json(self): return self._payload
class Transport:
    def __init__(self, responses): self.responses, self.calls = responses, []
    async def request(self, method, url, **kwargs):
        self.calls.append(url); value = self.responses.get(url)
        if isinstance(value, Exception): raise value
        return value
@pytest.fixture
def config(): return Config(request_timeout_seconds=1)
def test_parse_instances_strict_and_deduplicates():
    md = TABLE.replace("https://pipedapi.one", "https://pipedapi.one/\nextra | https://example.com/api/docs | x | No\none | https://pipedapi.one | US | Yes")
    assert parse_instances(md) == [("https://pipedapi.one", True), ("https://pipedapi.two", False)]
def test_invalid_instances_ignored(): assert parse_instances("one | https://example.com/api/docs | x | No") == []
@pytest.mark.asyncio
async def test_health_selection_prefers_cdn(config):
    transport = Transport({"https://pipedapi.one/search": Response({"items": []}), "https://pipedapi.two/search": Response({"items": []})})
    manager = InstanceManager(config, transport); manager.load_markdown(TABLE); assert await manager.health_check_all() == 2; assert manager.select().url == "https://pipedapi.one"
@pytest.mark.asyncio
async def test_failover_and_search_parsing(config):
    transport = Transport({"https://pipedapi.one/search": Response({"items": []}), "https://pipedapi.two/search": Response({"items": [{"type":"stream", "url":"/watch?v=abc", "title":"A", "uploaderName":"C"}]})})
    manager = InstanceManager(config, transport); manager.load_markdown(TABLE); await manager.health_check_all(); transport.responses["https://pipedapi.one/search"] = RuntimeError("down")
    result = await PipedClient(config, manager).search("runit"); assert result[0]["video_id"] == "abc"
def test_playback_url_uses_official_frontend(config):
    manager = InstanceManager(config); manager.load_markdown(TABLE); manager.instances["https://pipedapi.one"].healthy = True
    url = PipedClient(config, manager).playback_url("abcdefghijk", autoplay=True); query = parse_qs(urlparse(url).query)
    assert url.startswith("https://piped.video/watch?") and query["instance"] == ["https://pipedapi.one"] and query["playerAutoPlay"] == ["true"]
def test_config_from_env(monkeypatch):
    monkeypatch.setenv("YOUTUBE_MCP_PORT", "9000"); assert Config.from_env().listen_port == 9000
