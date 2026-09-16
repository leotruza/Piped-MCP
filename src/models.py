"""Data models and configuration for the YouTube/Piped MCP server."""
from __future__ import annotations

from dataclasses import dataclass
import os

DEFAULT_INSTANCE_LIST_URL = "https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md"
DEFAULT_FRONTEND_URL = "https://piped.video"

@dataclass(frozen=True)
class Config:
    listen_host: str = "127.0.0.1"
    listen_port: int = 8083
    instance_list_url: str = DEFAULT_INSTANCE_LIST_URL
    frontend_url: str = DEFAULT_FRONTEND_URL
    instance_refresh_minutes: float = 30.0
    health_check_minutes: float = 5.0
    request_timeout_seconds: float = 10.0
    search_cache_seconds: float = 45.0
    video_cache_seconds: float = 300.0

    @classmethod
    def from_env(cls) -> "Config":
        def number(name: str, default: float) -> float:
            value = os.getenv(name)
            return float(value) if value is not None else default
        return cls(
            listen_host=os.getenv("YOUTUBE_MCP_HOST", cls.listen_host),
            listen_port=int(os.getenv("YOUTUBE_MCP_PORT", cls.listen_port)),
            instance_list_url=os.getenv("YOUTUBE_MCP_INSTANCE_LIST_URL", cls.instance_list_url),
            frontend_url=os.getenv("YOUTUBE_MCP_FRONTEND_URL", cls.frontend_url).rstrip("/"),
            instance_refresh_minutes=number("YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES", cls.instance_refresh_minutes),
            health_check_minutes=number("YOUTUBE_MCP_HEALTH_CHECK_MINUTES", cls.health_check_minutes),
            request_timeout_seconds=number("YOUTUBE_MCP_TIMEOUT_SECONDS", cls.request_timeout_seconds),
            search_cache_seconds=number("YOUTUBE_MCP_SEARCH_CACHE_SECONDS", cls.search_cache_seconds),
            video_cache_seconds=number("YOUTUBE_MCP_VIDEO_CACHE_SECONDS", cls.video_cache_seconds),
        )

@dataclass
class InstanceState:
    url: str
    cdn: bool = False
    healthy: bool = False
    latency_ms: float | None = None
    failure_count: int = 0
    last_success: float | None = None
    last_health_check: float | None = None
    consecutive_failures: int = 0

class PipedError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.message, self.retryable = message, retryable

class NoHealthyInstances(PipedError):
    def __init__(self): super().__init__("No healthy Piped instances available", True)

class VideoNotFound(PipedError):
    def __init__(self): super().__init__("Video not found", False)
