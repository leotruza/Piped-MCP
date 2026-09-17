import { PipedError } from './config.js';

export class InvidiousClient {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; this.instances = config.invidiousInstances ?? []; }
  async request(instance, path, params = {}) { return this.fetch(`${instance.replace(/\/$/, '')}${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000) }); }
  async call(path, params = {}) {
    let lastError;
    for (const instance of this.instances) {
      try {
        const response = await this.request(instance, path, params);
        if (response.status === 404) throw new PipedError('Video not found', false);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload === null || typeof payload !== 'object') throw new Error('invalid Invidious JSON');
        return { payload, instance };
      } catch (error) { if (error instanceof PipedError && !error.retryable) throw error; lastError = error; }
    }
    throw new PipedError(`Invidious backends temporarily unavailable: ${lastError?.message ?? 'none configured'}`, true);
  }
  async search(query, filter = 'videos', limit = 10) {
    const type = filter === 'channels' ? 'channel' : filter === 'playlists' ? 'playlist' : filter === 'all' ? 'all' : 'video';
    const { payload } = await this.call('/api/v1/search', { q: query, type });
    return payload.slice(0, Math.max(1, Math.min(50, limit))).map(item => ({ title: item.title, video_id: item.videoId, channel: item.author, duration: item.lengthSeconds, views: item.viewCount, published: item.publishedText, thumbnail: item.videoThumbnails?.[0]?.url, type: item.type }));
  }
  async video(videoId) {
    const { payload } = await this.call(`/api/v1/videos/${encodeURIComponent(videoId)}`);
    if (!payload?.title) throw new PipedError('Video not found', false);
    return { video_id: payload.videoId ?? videoId, title: payload.title, description: payload.description, channel: payload.author, uploaderUrl: payload.authorUrl, duration: payload.lengthSeconds, views: payload.viewCount, published: payload.publishedText, thumbnail: payload.videoThumbnails?.[0]?.url, likes: payload.likeCount, dislikes: payload.dislikeCount, livestream: payload.liveNow, streams: { video: normalizeStreams(payload.formatStreams), audio: normalizeStreams(payload.adaptiveFormats?.filter(item => item.type?.startsWith('audio/'))) } };
  }
  playbackUrl(videoId, options = {}) {
    if (!this.instances.length) throw new PipedError('No Invidious instances configured', true);
    const params = new URLSearchParams({ v: videoId }); if (options.autoplay) params.set('autoplay', '1');
    return `${this.instances[0]}/watch?${params}`;
  }
}
function normalizeStreams(items = []) { return items.map(item => Object.fromEntries(Object.entries({ itag: item.itag, quality: item.qualityLabel ?? item.quality, mimeType: item.type, bitrate: item.bitrate, url: item.url, width: item.width, height: item.height, fps: item.fps }).filter(([, value]) => value !== undefined))); }
