import { PipedError, VideoNotFound } from './config.js';

export class PipedClient {
  constructor(config, manager) { this.config = config; this.manager = manager; this.cache = new Map(); }
  playbackUrl(videoId, { autoplay = false, listen = false, quality, sponsorblock } = {}) {
    const selected = this.manager.select();
    const params = new URLSearchParams({ v: videoId, instance: selected.url });
    if (autoplay) params.set('playerAutoPlay', 'true'); if (listen) params.set('listen', 'true');
    if (quality !== undefined) params.set('quality', String(quality)); if (sponsorblock !== undefined) params.set('sponsorblock', String(Boolean(sponsorblock)));
    return `${this.config.frontendUrl}/watch?${params}`;
  }
  async search(query, filter = 'videos', limit = 10) {
    limit = Math.max(1, Math.min(50, limit)); const key = `search:${query}:${filter}:${limit}`; const cached = this.get(key, this.config.searchCacheSeconds); if (cached) return cached;
    const { payload } = await this.call('/search', { q: query, filter }); const result = (payload.items ?? []).slice(0, limit).map(normalizeSearchItem); this.put(key, result); return result;
  }
  async video(videoId) {
    const key = `video:${videoId}`; const cached = this.get(key, this.config.videoCacheSeconds); if (cached) return cached;
    const { payload } = await this.call(`/streams/${encodeURIComponent(videoId)}`); if (!payload?.title) throw new VideoNotFound();
    const result = { video_id: payload.videoId ?? videoId, title: payload.title, description: payload.description, channel: payload.uploader, uploaderUrl: payload.uploaderUrl, duration: payload.duration, views: payload.views, published: payload.uploadDate, thumbnail: payload.thumbnailUrl, category: payload.category, likes: payload.likes, dislikes: payload.dislikes, streams: { video: normalizeStreams(payload.videoStreams), audio: normalizeStreams(payload.audioStreams) } };
    this.put(key, result); return result;
  }
  async call(path, params = {}) {
    const attempted = new Set(); let lastError;
    for (let i = 0; i < Math.max(1, this.manager.instances.size); i++) {
      const state = this.manager.select(attempted); attempted.add(state.url);
      try {
        const url = `${state.url.replace(/\/$/, '')}${path}?${new URLSearchParams(params)}`; const response = await this.manager.request(url);
        if (response.status === 404) throw new VideoNotFound(); if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json(); if (!payload || typeof payload !== 'object') throw new Error('invalid JSON object');
        state.healthy = true; state.lastSuccess = Date.now(); return { payload, instance: state.url };
      } catch (error) { if (error instanceof VideoNotFound) throw error; lastError = error; this.manager.markFailure(state.url); }
    }
    throw new PipedError(`Piped backend temporarily unavailable: ${lastError?.message ?? 'unknown error'}`, true);
  }
  get(key, ttl) { const item = this.cache.get(key); return item && (Date.now() - item.time < ttl * 1000) ? item.value : null; }
  put(key, value) { this.cache.set(key, { time: Date.now(), value }); }
}

function normalizeSearchItem(item) {
  const raw = item.url ?? ''; let videoId = item.id;
  try { videoId = new URL(raw, 'https://piped.local').searchParams.get('v') ?? videoId; } catch {}
  return { title: item.title, video_id: videoId, channel: item.uploaderName ?? item.channelName, duration: item.duration, views: item.views, published: item.uploadedDate ?? item.uploadDate, thumbnail: item.thumbnail ?? item.thumbnailUrl, type: item.type };
}
function normalizeStreams(items = []) { return items.map(item => Object.fromEntries(['itag','format','quality','mimeType','codec','width','height','bitrate','contentLength','url'].filter(k => item[k] !== undefined).map(k => [k, item[k]]))); }
