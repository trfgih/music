import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type MusicSource = 'audius' | 'itunes';
type RecordValue = Record<string, unknown>;
const discoveryIds = [
  '697195462',
  '1499378607',
  '1739659142',
  '1440838060',
  '1624173757',
  '1735414394',
  '1440812085',
  '1589963819',
];

class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 60,
  ) {
    super(message);
  }
}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function publicAudiusTrack(value: unknown): RecordValue | undefined {
  const item = record(value);
  if (
    !item ||
    item.is_delete === true ||
    item.is_deleted === true ||
    item.is_unlisted === true ||
    item.is_private === true ||
    item.is_scheduled_release === true
  )
    return undefined;
  const user = record(item.user);
  if (user?.is_deactivated === true) return undefined;
  // Передаём только данные для карточки трека и проверки доступности.
  const fields = [
    'id',
    'title',
    'duration',
    'artwork',
    'permalink',
    'album_backlink',
    'album_name',
    'is_streamable',
    'is_stream_gated',
    'is_available',
    'license',
    'license_url',
    'copyright_line',
    'producer_copyright_line',
  ];
  const conditions = record(item.stream_conditions);
  const access = record(item.access);
  return {
    ...Object.fromEntries(fields.map((name) => [name, item[name]])),
    // Адреса кошельков и ключи приложений клиенту не нужны.
    stream_conditions: conditions
      ? record(conditions.usdc_purchase)
        ? { usdc_purchase: {} }
        : { restricted: true }
      : null,
    access_authorities:
      Array.isArray(item.access_authorities) && item.access_authorities.length
        ? ['restricted']
        : null,
    allowed_api_keys:
      Array.isArray(item.allowed_api_keys) && item.allowed_api_keys.length ? ['restricted'] : null,
    access: access ? { stream: access.stream } : undefined,
    user: user && {
      id: user.id,
      name: user.name,
      handle: user.handle,
      is_available: user.is_available,
    },
  };
}

function isOpenTrack(item: RecordValue): boolean {
  const access = record(item.access);
  const conditions = record(item.stream_conditions);
  return (
    item.is_streamable === true &&
    item.is_stream_gated === false &&
    item.is_available !== false &&
    record(item.user)?.is_available !== false &&
    access?.stream !== false &&
    !conditions &&
    !(Array.isArray(item.access_authorities) && item.access_authorities.length) &&
    !(Array.isArray(item.allowed_api_keys) && item.allowed_api_keys.length)
  );
}

function discoveryTracks(items: RecordValue[]): RecordValue[] {
  const artists = new Set<string>();
  const tracks = new Set<string>();
  return items
    .filter((item) => {
      const user = record(item.user);
      const artist = String(user?.id ?? user?.handle ?? user?.name ?? item.id);
      const artwork = record(item.artwork);
      if (!isOpenTrack(item) || !artwork || artists.has(artist) || tracks.has(String(item.id)))
        return false;
      artists.add(artist);
      tracks.add(String(item.id));
      return true;
    })
    .slice(0, 24);
}

export function createMusicMiddleware() {
  const cache = new Map<string, { body: string; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const requests: Record<MusicSource, number[]> = { audius: [], itunes: [] };

  async function requestMusic(
    term: string,
    limit: number,
    discovery: boolean,
    source: MusicSource,
  ): Promise<string> {
    const key = `${source}:${discovery ? 'discovery' : `${term.toLocaleLowerCase()}:${limit}`}`;
    const stored = cache.get(key);
    if (stored && stored.expires > Date.now()) return stored.body;
    cache.delete(key);
    const existing = pending.get(key);
    if (existing) return existing;
    const window = source === 'audius' ? 1_000 : 60_000;
    const allowance = source === 'audius' ? 5 : 18;
    requests[source] = requests[source].filter((time) => Date.now() - time < window);
    if (requests[source].length >= allowance)
      throw new ServiceError(
        429,
        'Слишком много запросов. Подождите немного и попробуйте снова.',
        source === 'audius' ? 1 : 60,
      );
    requests[source].push(Date.now());

    const task = (async () => {
      const url =
        source === 'audius'
          ? new URL(`https://api.audius.co/v1/tracks/${discovery ? 'trending' : 'search'}`)
          : new URL(`https://itunes.apple.com/${discovery ? 'lookup' : 'search'}`);
      url.search = new URLSearchParams(
        source === 'audius'
          ? {
              app_name: 'Melodia',
              limit: discovery ? '100' : String(limit),
              ...(discovery ? { time: 'week' } : { query: term, sort_method: 'relevant' }),
            }
          : discovery
            ? { id: discoveryIds.join(','), country: 'US' }
            : { term, media: 'music', entity: 'song', country: 'US', limit: String(limit) },
      ).toString();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok)
        throw new ServiceError(
          response.status === 429 ? 429 : 502,
          'Музыкальный сервис временно недоступен. Попробуйте ещё раз.',
          source === 'audius' ? 1 : 60,
        );
      let data: RecordValue | undefined;
      try {
        data = record(await response.json());
      } catch {
        throw new ServiceError(502, 'Сервис вернул неожиданный ответ. Попробуйте ещё раз.');
      }
      const values = source === 'audius' ? data?.data : data?.results;
      if (!Array.isArray(values))
        throw new ServiceError(502, 'Сервис вернул неожиданный ответ. Попробуйте ещё раз.');

      let results: unknown[];
      if (source === 'audius') {
        const visible = values.flatMap((value) => {
          const item = publicAudiusTrack(value);
          return item ? [item] : [];
        });
        results = discovery ? discoveryTracks(visible) : visible;
      } else {
        results = discovery
          ? values
              .filter((value) => {
                const item = record(value);
                return item && discoveryIds.includes(String(item.trackId));
              })
              .sort(
                (a, b) =>
                  discoveryIds.indexOf(String(record(a)?.trackId)) -
                  discoveryIds.indexOf(String(record(b)?.trackId)),
              )
          : values;
      }
      const body = JSON.stringify({
        source,
        resultCount: results.length,
        results,
        truncated: !discovery && values.length >= limit,
      });
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, {
        body,
        expires: Date.now() + (source === 'audius' ? 5 * 60_000 : 60 * 60_000),
      });
      return body;
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  }

  return async function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const discovery = url.pathname === '/api/discover';
    if (url.pathname !== '/api/music' && !discovery) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      res.end(JSON.stringify({ error: 'Допускаются только запросы поиска.' }));
      return;
    }
    const source = url.searchParams.get('source') ?? 'itunes';
    if (source !== 'audius' && source !== 'itunes') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Выберите доступный источник музыки.' }));
      return;
    }
    const term = (url.searchParams.get('term') ?? '').trim().slice(0, 200);
    const rawLimit = Number(url.searchParams.get('limit') ?? 200);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
      : 200;
    if (!term && !discovery) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Введите название, исполнителя или альбом.' }));
      return;
    }
    try {
      res.end(await requestMusic(term, limit, discovery, source));
    } catch (error) {
      res.statusCode = error instanceof ServiceError ? error.status : 503;
      if (res.statusCode === 429)
        res.setHeader(
          'Retry-After',
          error instanceof ServiceError ? String(error.retryAfter) : '60',
        );
      res.end(
        JSON.stringify({
          error:
            error instanceof ServiceError
              ? error.message
              : 'Не удалось связаться с музыкальным сервисом. Проверьте соединение и повторите.',
        }),
      );
    }
  };
}

export function musicProxy(): Plugin {
  const middleware = createMusicMiddleware();
  return {
    name: 'melodia-music-service',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
