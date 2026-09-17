import { NoHealthyInstances } from './config.js';
const API_HOST_RE = /^(?:pipedapi(?:-libre)?|piped-api)\.|^api\.piped\./i;
const URL_RE = /https?:\/\/[^\s|<>]+/i;
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
export function parseInstances(markdown) {
  const lines = markdown.split(/\r?\n/); let apiIndex = -1; let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) { const headers = cells(lines[i]).map(x => x.toLowerCase()); if (headers.includes('instance api url')) { apiIndex = headers.indexOf('instance api url'); headerIndex = i; break; } }
  if (apiIndex < 0) return [];
  const found = new Map();
  for (const line of lines.slice(headerIndex + 2)) {
    const row = cells(line); if (row.length <= apiIndex) continue; const match = row[apiIndex].match(URL_RE); if (!match) continue;
    let parsed; try { parsed = new URL(match[0].replace(/[`),.;]+$/, '')); } catch { continue; }
    if (parsed.protocol !== 'https:' || !API_HOST_RE.test(parsed.hostname)) continue;
    const url = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
    found.set(url, (found.get(url) ?? false) || /\bcdn\b|\byes\b/i.test(line));
  }
  return [...found].map(([url, cdn]) => ({ url, cdn }));
}
export class InstanceManager {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; this.instances = new Map(); this.lastListRefresh = null; }
  loadMarkdown(markdown) { for (const { url, cdn } of parseInstances(markdown)) { const old = this.instances.get(url); this.instances.set(url, old ? { ...old, cdn: old.cdn || cdn } : { url, cdn, healthy: false, latencyMs: null, failureCount: 0, consecutiveFailures: 0, lastSuccess: null, lastHealthCheck: null }); } this.lastListRefresh = Date.now(); console.info(`[INFO] Loaded ${this.instances.size} public instances`); return this.instances.size; }
  async request(url, options = {}) { return this.fetch(url, { ...options, signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000) }); }
  async refresh() { const response = await this.request(this.config.instanceListUrl); if (!response.ok) throw new Error(`instance list returned HTTP ${response.status}`); return this.loadMarkdown(await response.text()); }
  async healthCheck(state) { const started = performance.now(); try { const response = await this.request(`${state.url}/search?q=test&filter=all`); const payload = await response.json(); if (!response.ok || !payload || !Array.isArray(payload.items)) throw new Error('unexpected Piped search response'); Object.assign(state, { healthy: true, consecutiveFailures: 0, latencyMs: performance.now() - started, lastSuccess: Date.now(), lastHealthCheck: Date.now() }); return true; } catch (error) { Object.assign(state, { healthy: false, failureCount: state.failureCount + 1, consecutiveFailures: state.consecutiveFailures + 1, lastHealthCheck: Date.now() }); console.warn(`[WARN] Health check failed for ${state.url}: ${error.message}`); return false; } }
  async healthCheckAll() { const results = await Promise.all([...this.instances.values()].map(state => this.healthCheck(state))); const count = results.filter(Boolean).length; console.info(`[INFO] ${count} instances passed health checks`); return count; }
  select(exclude = new Set()) { const candidates = [...this.instances.values()].filter(s => s.healthy && !exclude.has(s.url)); if (!candidates.length) throw new NoHealthyInstances(); return candidates.sort((a, b) => Number(b.cdn) - Number(a.cdn) || a.consecutiveFailures - b.consecutiveFailures || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || a.failureCount - b.failureCount)[0]; }
  markFailure(url) { const state = this.instances.get(url); if (state) Object.assign(state, { healthy: false, failureCount: state.failureCount + 1, consecutiveFailures: state.consecutiveFailures + 1 }); }
}
