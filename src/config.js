export const DEFAULT_INSTANCE_LIST_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md';
export const DEFAULT_FRONTEND_URL = 'https://piped.video';
export const DEFAULT_INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si'
];

export function loadConfig(env = process.env) {
  const number = (name, fallback) => env[name] === undefined ? fallback : Number(env[name]);
  return {
    host: env.YOUTUBE_MCP_HOST ?? '127.0.0.1',
    port: number('YOUTUBE_MCP_PORT', 8083),
    transport: env.YOUTUBE_MCP_TRANSPORT ?? 'stdio',
    instanceListUrl: env.YOUTUBE_MCP_INSTANCE_LIST_URL ?? DEFAULT_INSTANCE_LIST_URL,
    frontendUrl: (env.YOUTUBE_MCP_FRONTEND_URL ?? DEFAULT_FRONTEND_URL).replace(/\/$/, ''),
    invidiousInstances: env.YOUTUBE_MCP_INVIDIOUS_INSTANCES === undefined ? [...DEFAULT_INVIDIOUS_INSTANCES] : env.YOUTUBE_MCP_INVIDIOUS_INSTANCES.split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean),
    instanceRefreshMinutes: number('YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES', 30),
    healthCheckMinutes: number('YOUTUBE_MCP_HEALTH_CHECK_MINUTES', 5),
    timeoutSeconds: number('YOUTUBE_MCP_TIMEOUT_SECONDS', 30),
    searchCacheSeconds: number('YOUTUBE_MCP_SEARCH_CACHE_SECONDS', 45),
    videoCacheSeconds: number('YOUTUBE_MCP_VIDEO_CACHE_SECONDS', 300)
  };
}

export class PipedError extends Error {
  constructor(message, retryable = true) { super(message); this.name = 'PipedError'; this.retryable = retryable; }
}
export class NoHealthyInstances extends PipedError {
  constructor() { super('No healthy Piped instances available', true); }
}
export class VideoNotFound extends PipedError {
  constructor() { super('Video not found', false); }
}
