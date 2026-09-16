import { NoHealthyInstances } from './config.js';

const URL_RE = /https?:\/\/[^\s|<>]+/gi;

export function deriveFrontendUrl(apiUrl) {
  const parsed = new URL(apiUrl);
  let host = parsed.hostname;
  for (const prefix of ['pipedapi-libre.', 'pipedapi.', 'piped-api.', 'api.piped.', 'api.']) {
    if (host.startsWith(prefix)) { host = host.slice(prefix.length); break; }
  }
  return `https://${host}`;
}

export function parseInstances(markdown) {
  const found = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.toLowerCase().includes('http') || line.trimStart().startsWith('<!--')) continue;
    const isCdn = /\bcdn\b|\byes\b/i.test(line);
    for (const raw of line.match(URL_RE) ?? []) {
      const clean = raw.replace(/[`),.;]+$/, '');
      let parsed;
      try { parsed = new URL(clean); } catch { continue; }
      if (parsed.protocol !== 'https:' || /registered\/badge/i.test(parsed.pathname)) continue;
      if (!/(pipedapi|api)/i.test(parsed.hostname + parsed.pathname)) continue;
      const base = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
      found.set(base, { cdn: (found.get(base)?.cdn ?? false) || isCdn, frontend: deriveFrontendUrl(base) });
    }
  }
  return [...found].map(([url, metadata]) => ({ url, ...metadata }));
}

export class InstanceManager {
  constructor(config, fetchImpl = fetch) {
    this.config = config; this.fetch = fetchImpl; this.instances = new Map(); this.lastListRefresh = null;
  }
  loadMarkdown(markdown) {
    for (const { url, cdn, frontend } of parseInstances(markdown)) {
      const old = this.instances.get(url);
      this.instances.set(url, old ? { ...old, cdn: old.cdn || cdn, frontend: old.frontend || frontend } : { url, frontend, cdn, healthy: false, latencyMs: null, failureCount: 0, consecutiveFailures: 0, lastSuccess: null, lastHealthCheck: null });
    }
    this.lastListRefresh = Date.now();
    console.info(`[INFO] Loaded ${this.instances.size} public instances`);
    return this.instances.size;
  }
  async request(url, options = {}) {
    return this.fetch(url, { ...options, signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000) });
  }
  async refresh() {
    const response = await this.request(this.config.instanceListUrl);
    if (!response.ok) throw new Error(`instance list returned HTTP ${response.status}`);
    return this.loadMarkdown(await response.text());
  }
  async healthCheck(state) {
    const started = performance.now();
    try {
      const response = await this.request(`${state.url}/search?q=test&filter=all`);
      const payload = await response.json();
      if (!response.ok || !payload || !Array.isArray(payload.items)) throw new Error('unexpected Piped search response');
      Object.assign(state, { healthy: true, consecutiveFailures: 0, latencyMs: performance.now() - started, lastSuccess: Date.now(), lastHealthCheck: Date.now() });
      return true;
    } catch (error) {
      Object.assign(state, { healthy: false, failureCount: state.failureCount + 1, consecutiveFailures: state.consecutiveFailures + 1, lastHealthCheck: Date.now() });
      console.warn(`[WARN] Health check failed for ${state.url}: ${error.message}`);
      return false;
    }
  }
  async healthCheckAll() {
    let count = 0;
    for (const state of this.instances.values()) count += await this.healthCheck(state) ? 1 : 0;
    console.info(`[INFO] ${count} instances passed health checks`);
    return count;
  }
  select(exclude = new Set()) {
    const candidates = [...this.instances.values()].filter(s => s.healthy && !exclude.has(s.url));
    if (!candidates.length) throw new NoHealthyInstances();
    return candidates.sort((a, b) => Number(b.cdn) - Number(a.cdn) || a.consecutiveFailures - b.consecutiveFailures || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || a.failureCount - b.failureCount)[0];
  }
  markFailure(url) { const state = this.instances.get(url); if (state) Object.assign(state, { healthy: false, failureCount: state.failureCount + 1, consecutiveFailures: state.consecutiveFailures + 1 }); }
}
