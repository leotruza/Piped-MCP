"""Standalone MCP server exposing YouTube search, video details, and playback URLs."""
from __future__ import annotations
import asyncio, logging
from .instances import InstanceManager
from .models import Config, PipedError
from .piped import PipedClient

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("Install dependencies with: pip install -r requirements.txt") from exc

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
config = Config.from_env()
manager = InstanceManager(config)
client = PipedClient(config, manager)
mcp = FastMCP("youtube-piped")

@mcp.tool()
async def youtube_search(query: str, filter: str = "videos", limit: int = 10) -> dict:
    """Search YouTube via Piped; filter is videos, channels, playlists, or all."""
    if not query.strip(): raise ValueError("query must not be empty")
    if filter not in {"videos", "channels", "playlists", "all"}: raise ValueError("invalid filter")
    try: return {"results": await client.search(query.strip(), filter, limit)}
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

@mcp.tool()
async def youtube_video(video_id: str) -> dict:
    """Retrieve concise video metadata and available stream information via Piped."""
    if not video_id.strip(): raise ValueError("video_id must not be empty")
    try: return await client.video(video_id.strip())
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

@mcp.tool()
async def youtube_play(video_id: str, autoplay: bool = False, listen: bool = False, quality: int | None = None, sponsorblock: bool | None = None) -> dict:
    """Generate a browser-ready piped.video URL; this tool never launches a browser."""
    if not video_id.strip(): raise ValueError("video_id must not be empty")
    try: return {"url": client.playback_url(video_id.strip(), autoplay=autoplay, listen=listen, quality=quality, sponsorblock=sponsorblock)}
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

async def initialize() -> None:
    await manager.refresh()
    await manager.health_check_all()

async def main() -> None:
    try: await initialize()
    except Exception as exc: logging.warning("Initial instance discovery failed: %s", exc)
    await mcp.run_stdio_async()

if __name__ == "__main__": asyncio.run(main())
