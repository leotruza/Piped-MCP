import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadConfig, PipedError } from './config.js';
import { InstanceManager } from './instances.js';
import { PipedClient } from './piped.js';
import { InvidiousClient } from './invidious.js';
const log = (...args) => console.error(...args);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const FILTERS = ['all','videos','channels','playlists','music_songs','music_videos','music_albums','music_playlists','music_artists'];
export function createApp(config = loadConfig(), fetchImpl = fetch) {
  const manager = new InstanceManager(config, fetchImpl); const client = new PipedClient(config, manager); const invidious = new InvidiousClient(config, fetchImpl); const server = new McpServer({ name: 'youtube-piped', version: '1.0.0' });
  const errorResult = error => ({ content: [{ type: 'text', text: JSON.stringify({ error: error.message, retryable: error.retryable ?? true }) }], isError: true });
  const withFallback = async (primary, fallback) => { try { return await primary(); } catch (error) { if (invidious.instances.length) return fallback(); throw error; } };
  server.tool('youtube_search', 'Search YouTube through Piped, with optional Invidious fallback.', { query: z.string().min(1), filter: z.enum(FILTERS), limit: z.number().int().min(1).max(50).default(10) }, async ({ query, filter, limit }) => { try { return { content: [{ type: 'text', text: JSON.stringify({ results: await withFallback(() => client.search(query.trim(), filter, limit), () => invidious.search(query.trim(), filter, limit)) }) }] }; } catch (e) { return errorResult(e); } });
  server.tool('youtube_video', 'Retrieve video metadata and streams through Piped, with optional Invidious fallback.', { video_id: z.string().regex(VIDEO_ID, 'video_id must be an 11-character YouTube video ID') }, async ({ video_id }) => { try { return { content: [{ type: 'text', text: JSON.stringify(await withFallback(() => client.video(video_id), () => invidious.video(video_id))) }] }; } catch (e) { return errorResult(e); } });
  server.tool('youtube_play', 'Generate a browser-ready Piped or Invidious URL without launching a browser.', { video_id: z.string().regex(VIDEO_ID, 'video_id must be an 11-character YouTube video ID'), autoplay: z.boolean().default(false), listen: z.boolean().default(false), quality: z.number().int().optional(), sponsorblock: z.boolean().optional() }, async ({ video_id, ...options }) => { try { return { content: [{ type: 'text', text: JSON.stringify({ url: await withFallback(() => client.playbackUrl(video_id, options), () => invidious.playbackUrl(video_id, options)) }) }] }; } catch (e) { return errorResult(e); } });
  return { server, manager, client, invidious };
}
export async function initialize(manager) { try { await manager.refresh(); await manager.healthCheckAll(); } catch (error) { log(`[WARN] Initial instance discovery failed: ${error.message}`); } }
async function refreshLoop(manager, invidious, config) { while (true) { try { await manager.refresh(); await manager.healthCheckAll(); await invidious.healthCheckAll(); } catch (e) { log(`[WARN] Instance refresh failed: ${e.message}`); } await new Promise(resolve => setTimeout(resolve, config.instanceRefreshMinutes * 60_000)); } }
async function healthLoop(manager, invidious, config) { while (true) { await new Promise(resolve => setTimeout(resolve, config.healthCheckMinutes * 60_000)); try { await manager.healthCheckAll(); await invidious.healthCheckAll(); } catch (e) { log(`[WARN] Health refresh failed: ${e.message}`); } } }
async function main() {
  const config = loadConfig(); const { server, manager, invidious } = createApp(config); const tasks = [refreshLoop(manager, invidious, config), healthLoop(manager, invidious, config)];
  if (config.transport === 'stdio') { await server.connect(new StdioServerTransport()); await new Promise(() => {}); return; }
  if (config.transport === 'streamable-http') { const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); await server.connect(transport); const httpServer = createServer(async (req, res) => { if (req.url !== '/mcp') { res.writeHead(404); return res.end('Not found'); } await transport.handleRequest(req, res); }); httpServer.listen(config.port, config.host, () => log(`[INFO] MCP HTTP listening on ${config.host}:${config.port}/mcp`)); await new Promise(() => {}); return; }
  throw new Error(`Unsupported transport: ${config.transport}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { log(error); process.exit(1); });
