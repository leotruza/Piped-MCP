"""Standalone MCP server exposing YouTube search, video details, and playback URLs."""
from __future__ import annotations
import asyncio, logging, os, re
from .instances import InstanceManager
from .models import Config, PipedError
from .piped import PipedClient
try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc: raise RuntimeError("Install dependencies with: pip install -r requirements.txt") from exc
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
config, manager, client = Config.from_env(), None, None
manager = InstanceManager(config); client = PipedClient(config, manager); mcp = FastMCP("youtube-piped", host=config.listen_host, port=config.listen_port)
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

@mcp.tool()
async def youtube_search(query: str, filter: str = "videos", limit: int = 10) -> dict:
    if not query.strip(): raise ValueError("query must not be empty")
    if filter not in {"videos","channels","playlists","all","music_songs","music_videos","music_albums","music_playlists","music_artists"}: raise ValueError("invalid filter")
    try: return {"results": await client.search(query.strip(), filter, limit)}
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

@mcp.tool()
async def youtube_video(video_id: str) -> dict:
    if not VIDEO_ID_RE.fullmatch(video_id.strip()): raise ValueError("video_id must be an 11-character YouTube video ID")
    try: return await client.video(video_id.strip())
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

@mcp.tool()
async def youtube_play(video_id: str, autoplay=False, listen=False, quality=None, sponsorblock=None) -> dict:
    if not VIDEO_ID_RE.fullmatch(video_id.strip()): raise ValueError("video_id must be an 11-character YouTube video ID")
    try: return {"url": client.playback_url(video_id.strip(), autoplay=autoplay, listen=listen, quality=quality, sponsorblock=sponsorblock)}
    except PipedError as exc: return {"error": exc.message, "retryable": exc.retryable}

async def _refresh_loop():
    while True:
        try: await manager.refresh()
        except Exception as exc: logging.warning("Instance refresh failed: %s", exc)
        await asyncio.sleep(config.instance_refresh_minutes * 60)

async def _health_loop():
    while True:
        try: await manager.health_check_all()
        except Exception as exc: logging.warning("Health refresh failed: %s", exc)
        await asyncio.sleep(config.health_check_minutes * 60)

async def main() -> None:
    tasks = [asyncio.create_task(_refresh_loop()), asyncio.create_task(_health_loop())]
    try:
        transport = os.getenv("YOUTUBE_MCP_TRANSPORT", "stdio")
        if transport == "stdio": await mcp.run_stdio_async()
        else: mcp.run(transport=transport)
    finally:
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
if __name__ == "__main__": asyncio.run(main())
