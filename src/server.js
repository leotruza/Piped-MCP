import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadConfig, PipedError } from './config.js';
import { InstanceManager } from './instances.js';
import { PipedClient } from './piped.js';

export function createApp(config = loadConfig(), fetchImpl = fetch) {
  const manager = new InstanceManager(config, fetchImpl); const client = new PipedClient(config, manager);
  const server = new McpServer({ name: 'youtube-piped', version: '1.0.0' });
  const errorResult = error => ({ content: [{ type: 'text', text: JSON.stringify({ error: error.message, retryable: error.retryable ?? true }) }], isError: true });
  server.tool('youtube_search', 'Search YouTube through Piped.', { query: z.string().min(1), filter: z.enum(['videos', 'channels', 'playlists', 'all']).default('videos'), limit: z.number().int().min(1).max(50).default(10) }, async ({ query, filter, limit }) => { try { return { content: [{ type: 'text', text: JSON.stringify({ results: await client.search(query.trim(), filter, limit) }) }] }; } catch (e) { return errorResult(e); } });
  server.tool('youtube_video', 'Retrieve video metadata and available streams through Piped.', { video_id: z.string().min(1) }, async ({ video_id }) => { try { return { content: [{ type: 'text', text: JSON.stringify(await client.video(video_id.trim())) }] }; } catch (e) { return errorResult(e); } });
  server.tool('youtube_play', 'Generate a browser-ready Piped URL without launching a browser.', { video_id: z.string().min(1), autoplay: z.boolean().default(false), listen: z.boolean().default(false), quality: z.number().int().optional(), sponsorblock: z.boolean().optional() }, async ({ video_id, ...options }) => { try { return { content: [{ type: 'text', text: JSON.stringify({ url: client.playbackUrl(video_id.trim(), options) }) }] }; } catch (e) { return errorResult(e); } });
  return { server, manager, client };
}

export async function initialize(manager) { try { await manager.refresh(); await manager.healthCheckAll(); } catch (error) { console.warn(`[WARN] Initial instance discovery failed: ${error.message}`); } }

async function main() {
  const config = loadConfig(); const { server, manager } = createApp(config); await initialize(manager);
  const refreshTimer = setInterval(() => manager.refresh().catch(e => console.warn(`[WARN] Instance refresh failed: ${e.message}`)), config.instanceRefreshMinutes * 60_000);
  const healthTimer = setInterval(() => manager.healthCheckAll().catch(e => console.warn(`[WARN] Health refresh failed: ${e.message}`)), config.healthCheckMinutes * 60_000);
  process.once('SIGINT', () => { clearInterval(refreshTimer); clearInterval(healthTimer); process.exit(0); });
  if (config.transport === 'stdio') { await server.connect(new StdioServerTransport()); return; }
  if (config.transport === 'streamable-http') {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); await server.connect(transport);
    const httpServer = createServer(async (req, res) => { if (req.url !== '/mcp') { res.writeHead(404); return res.end('Not found'); } await transport.handleRequest(req, res); });
    httpServer.listen(config.port, config.host, () => console.info(`[INFO] MCP HTTP listening on ${config.host}:${config.port}/mcp`)); return;
  }
  throw new Error(`Unsupported transport: ${config.transport}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error); process.exit(1); });
