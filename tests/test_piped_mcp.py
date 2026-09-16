import time
import pytest
from urllib.parse import parse_qs, urlparse
from src.models import Config, VideoNotFound
from src.instances import parse_instances, InstanceManager
from src.piped import PipedClient

class Response:
    def __init__(self, payload, status_code=200, text=""):
        self._payload, self.status_code, self.text = payload, status_code, text
    def json(self): return self._payload

class Transport:
    def __init__(self, responses): self.responses, self.calls = responses, []
    async def request(self, method, url, **kwargs):
        self.calls.append(url)
        value = self.responses.get(url)
        if isinstance(value, Exception): raise value
        return value

@pytest.fixture
def config(): return Config(request_timeout_seconds=1)

def test_parse_instances_deduplicates_and_marks_cdn():
    md = """| API | CDN |\n| https://pipedapi.one | yes |\n| https://pipedapi.one/ | yes |\n| https://pipedapi.two | no |\n| https://piped.video | no |"""
    assert parse_instances(md) == [("https://pipedapi.one", True), ("https://pipedapi.two", False)]

def test_invalid_instances_ignored():
    assert parse_instances("http://api.example\nnot-a-url\nhttps://example.com") == []

@pytest.mark.asyncio
async def test_health_selection_prefers_cdn(config):
    transport = Transport({"https://pipedapi.one/search": Response({"items": []}), "https://pipedapi.two/search": Response({"items": []})})
    manager = InstanceManager(config, transport); manager.load_markdown("| https://pipedapi.one | no |\n| https://pipedapi.two | CDN |")
    assert await manager.health_check_all() == 2
    assert manager.select().url == "https://pipedapi.two"

@pytest.mark.asyncio
async def test_failover_and_search_parsing(config):
    transport = Transport({
        "https://pipedapi.one/search": Response({"items": []}),
        "https://pipedapi.two/search": Response({"items": [{"type":"stream", "url":"/watch?v=abc", "title":"A", "uploaderName":"C", "duration":12}]})
    })
    manager = InstanceManager(config, transport); manager.load_markdown("| https://pipedapi.one | CDN |\n| https://pipedapi.two | CDN |")
    await manager.health_check_all()
    transport.responses["https://pipedapi.one/search"] = RuntimeError("down")
    client = PipedClient(config, manager)
    result = await client.search("runit", limit=5)
    assert result[0]["video_id"] == "abc" and "https://pipedapi.two/search" in transport.calls

@pytest.mark.asyncio
async def test_video_metadata_and_streams(config):
    transport = Transport({"https://pipedapi.one/search": Response({"items": []}), "https://pipedapi.one/streams/abc": Response({"videoId":"abc", "title":"Title", "uploader":"Channel", "duration":42, "videoStreams":[{"quality":"720p","url":"secret"}], "audioStreams":[]})})
    manager = InstanceManager(config, transport); manager.load_markdown("| https://pipedapi.one | CDN |\n"); await manager.health_check_all()
    result = await PipedClient(config, manager).video("abc")
    assert result["video_id"] == "abc" and result["streams"]["video"][0]["quality"] == "720p"

def test_playback_url_encoding(config):
    manager = InstanceManager(config); manager.load_markdown("| https://pipedapi.example/path | CDN |")
    manager.instances["https://pipedapi.example/path"].healthy = True
    url = PipedClient(config, manager).playback_url("abc", autoplay=True, listen=True, quality=1080)
    query = parse_qs(urlparse(url).query)
    assert url.startswith("https://piped.video/watch?") and query["v"] == ["abc"] and query["instance"] == ["https://pipedapi.example/path"]
    assert query["playerAutoPlay"] == ["true"] and query["quality"] == ["1080"]

def test_config_from_env(monkeypatch):
    monkeypatch.setenv("YOUTUBE_MCP_PORT", "9000"); monkeypatch.setenv("YOUTUBE_MCP_TIMEOUT_SECONDS", "3")
    assert Config.from_env().listen_port == 9000 and Config.from_env().request_timeout_seconds == 3
