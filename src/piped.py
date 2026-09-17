"""Piped API client with retry/failover, caching, and normalized responses."""
from __future__ import annotations
import time
from urllib.parse import urlencode, urlparse, parse_qs
from .instances import InstanceManager
from .models import Config, PipedError, VideoNotFound

VIDEO_ID_RE = r"^[A-Za-z0-9_-]{11}$"
class PipedClient:
    def __init__(self, config: Config, manager: InstanceManager): self.config, self.manager, self._cache = config, manager, {}
    def playback_url(self, video_id: str, *, autoplay=False, listen=False, quality=None, sponsorblock=None) -> str:
        params = {"v": video_id, "instance": self.manager.select().url}
        if autoplay: params["playerAutoPlay"] = "true"
        if listen: params["listen"] = "true"
        if quality is not None: params["quality"] = str(quality)
        if sponsorblock is not None: params["sponsorblock"] = "true" if sponsorblock else "false"
        return f"{self.config.frontend_url}/watch?{urlencode(params)}"
    async def search(self, query: str, filter="videos", limit=10) -> list[dict]:
        limit = max(1, min(limit, 50)); key = ("search", query, filter, limit); cached = self._get(key, self.config.search_cache_seconds)
        if cached is not None: return cached
        payload, _ = await self._call("/search", {"q": query, "filter": filter}); result = [self._search_item(x) for x in payload.get("items", [])[:limit]]; self._put(key, result); return result
    async def video(self, video_id: str) -> dict:
        key = ("video", video_id); cached = self._get(key, self.config.video_cache_seconds)
        if cached is not None: return cached
        payload, _ = await self._call(f"/streams/{video_id}")
        if not isinstance(payload, dict) or payload.get("title") is None: raise VideoNotFound()
        result = {k: payload.get(k) for k in ("videoId","title","description","uploader","uploaderUrl","duration","views","uploadDate","thumbnailUrl","category","likes","dislikes","livestream","dash","hls","subtitles")}
        result["video_id"] = result.pop("videoId") or video_id; result["channel"] = result.pop("uploader")
        result["streams"] = {"video": self._stream_list(payload.get("videoStreams")), "audio": self._stream_list(payload.get("audioStreams"))}; self._put(key, result); return result
    async def _call(self, path, params=None):
        attempted, last_error = set(), None
        for _ in range(max(1, len(self.manager.instances))):
            state = self.manager.select(attempted); attempted.add(state.url)
            try:
                response = await self.manager._request("GET", state.url.rstrip("/") + path, params=params or {})
                if response.status_code == 404: raise VideoNotFound()
                if response.status_code >= 400: raise RuntimeError(f"HTTP {response.status_code}")
                payload = response.json()
                if not isinstance(payload, dict): raise ValueError("invalid JSON object")
                state.healthy, state.last_success = True, time.time(); return payload, state.url
            except VideoNotFound: raise
            except Exception as exc: last_error = exc; self.manager.mark_failure(state.url)
        raise PipedError(f"Piped backend temporarily unavailable: {last_error}", True)
    @staticmethod
    def _search_item(item):
        kind = item.get("type", "").lower(); raw_url = item.get("url", ""); vid = parse_qs(urlparse(raw_url).query).get("v", [None])[0] or raw_url.rsplit("/", 1)[-1] or item.get("id")
        return {"title": item.get("title"), "channel": item.get("uploaderName") or item.get("channelName"), "duration": item.get("duration"), "views": item.get("views"), "published": item.get("uploadedDate") or item.get("uploadDate"), "thumbnail": item.get("thumbnail") or item.get("thumbnailUrl"), "type": kind, "video_id": vid}
    @staticmethod
    def _stream_list(items): return [{k: item.get(k) for k in ("itag","format","quality","mimeType","codec","width","height","bitrate","contentLength","url","fps","videoOnly") if item.get(k) is not None} for item in (items or [])]
    def _get(self, key, ttl):
        entry = self._cache.get(key); return entry[1] if entry and time.time() - entry[0] < ttl else None
    def _put(self, key, value): self._cache[key] = (time.time(), value)
