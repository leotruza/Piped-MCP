import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { parseInstances, InstanceManager } from '../src/instances.js';
import { PipedClient } from '../src/piped.js';
import { InvidiousClient } from '../src/invidious.js';
const TABLE = `Instance Name | Instance API URL | Instance Location(s) | CDN\n--- | --- | --- | ---\none | https://pipedapi.one | US | Yes\ntwo | https://pipedapi.two | DE | No`;
class Response { constructor(payload, status = 200, text = '') { this.payload = payload; this.status = status; this.ok = status < 400; this.textValue = text; } async json() { return this.payload; } async text() { return this.textValue; } }
function fakeFetch(responses) { const calls = []; const fn = async url => { calls.push(String(url)); const value = responses[String(url).split('?')[0]]; if (value instanceof Error) throw value; return value; }; fn.calls = calls; return fn; }
const config = () => ({ ...loadConfig({}) });
test('parses strict official table and deduplicates', () => { const md = TABLE.replace('https://pipedapi.one', 'https://pipedapi.one/\nextra | https://example.com/api/docs | x | No\none | https://pipedapi.one | US | Yes'); assert.deepEqual(parseInstances(md), [{ url: 'https://pipedapi.one', cdn: true }, { url: 'https://pipedapi.two', cdn: false }]); });
test('ignores invalid API rows', () => assert.deepEqual(parseInstances('one | https://example.com/api/docs | x | No'), []));
test('health checks and prefers CDN', async () => { const fetcher = fakeFetch({ 'https://pipedapi.one/search': new Response({ items: [] }), 'https://pipedapi.two/search': new Response({ items: [] }) }); const manager = new InstanceManager(config(), fetcher); manager.loadMarkdown(TABLE); assert.equal(await manager.healthCheckAll(), 2); assert.equal(manager.select().url, 'https://pipedapi.one'); });
test('fails over and normalizes search results', async () => { const fetcher = fakeFetch({ 'https://pipedapi.one/search': new Response({ items: [] }), 'https://pipedapi.two/search': new Response({ items: [{ type: 'stream', url: '/watch?v=abc', title: 'A', uploaderName: 'C' }] }) }); const manager = new InstanceManager(config(), fetcher); manager.loadMarkdown(TABLE); await manager.healthCheckAll(); manager.fetch = async url => { if (String(url).startsWith('https://pipedapi.one/search')) throw new Error('down'); return fetcher(url); }; assert.equal((await new PipedClient(config(), manager).search('runit'))[0].video_id, 'abc'); });
test('uses piped.video with encoded API instance', () => { const manager = new InstanceManager(config(), fakeFetch({})); manager.loadMarkdown(TABLE); manager.instances.get('https://pipedapi.one').healthy = true; const parsed = new URL(new PipedClient(config(), manager).playbackUrl('abcdefghijk', { autoplay: true })); assert.equal(parsed.hostname, 'piped.video'); assert.equal(parsed.searchParams.get('instance'), 'https://pipedapi.one'); assert.equal(parsed.searchParams.get('playerAutoPlay'), 'true'); });
test('loads configuration and uses documented transport defaults', () => { const result = loadConfig({ YOUTUBE_MCP_PORT: '9000', YOUTUBE_MCP_TRANSPORT: 'stdio' }); assert.equal(result.port, 9000); assert.equal(result.transport, 'stdio'); assert.equal(result.timeoutSeconds, 30); });
test('loads default Invidious fallback and supports overrides or opt-out', () => { assert.ok(loadConfig({}).invidiousInstances.length >= 5); const result = loadConfig({ YOUTUBE_MCP_INVIDIOUS_INSTANCES: 'https://invidious.one/, https://invidious.two' }); assert.deepEqual(result.invidiousInstances, ['https://invidious.one', 'https://invidious.two']); assert.deepEqual(loadConfig({ YOUTUBE_MCP_INVIDIOUS_INSTANCES: '' }).invidiousInstances, []); });
test('normalizes Invidious search and video responses', async () => {
  const cfg = { ...config(), invidiousInstances: ['https://invidious.one'] };
  const fetcher = async url => String(url).includes('/search?') ? new Response([{ type: 'video', title: 'A', videoId: 'abcdefghijk', author: 'C', lengthSeconds: 12 }]) : new Response({ title: 'A', videoId: 'abcdefghijk', author: 'C', lengthSeconds: 12, formatStreams: [{ itag: '18', qualityLabel: '360p', type: 'video/mp4', url: 'https://video' }] });
  const client = new InvidiousClient(cfg, fetcher); assert.equal((await client.search('test'))[0].video_id, 'abcdefghijk'); assert.equal((await client.video('abcdefghijk')).streams.video[0].quality, '360p');
});
test('checks Invidious instances through the stats endpoint', async () => {
  const cfg = { ...config(), invidiousInstances: ['https://invidious.one', 'https://invidious.two'] };
  const client = new InvidiousClient(cfg, async url => String(url).includes('invidious.one') ? new Response({ software: { name: 'invidious' } }) : new Response({ error: 'down' }, 503));
  assert.equal(await client.healthCheckAll(), 1); assert.equal(client.health.get('https://invidious.one'), true); assert.equal(client.health.get('https://invidious.two'), false);
});
test('completes an MCP stdio handshake without stdout diagnostics', async () => {
  const client = new Client({ name: 'stdio-regression-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.js', import.meta.url))], env: { ...process.env, YOUTUBE_MCP_TRANSPORT: 'stdio', YOUTUBE_MCP_TIMEOUT_SECONDS: '1', YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES: '60', YOUTUBE_MCP_HEALTH_CHECK_MINUTES: '60' } });
  try { await client.connect(transport); const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['youtube_play', 'youtube_search', 'youtube_video']); }
  finally { await transport.close(); }
});
