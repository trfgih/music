import type { MusicResult, MusicSource, Track } from '../types';

const SEARCH_LIMIT = 200;
const CACHE_DURATION = 5 * 60 * 1000;
const cache = new Map<string, { result: MusicResult; expiresAt: number }>();

interface PendingRequest {
  controller: AbortController;
  promise: Promise<MusicResult>;
  subscribers: number;
  settled: boolean;
  abortTimer?: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeItunesTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.trackId !== 'number' || !Number.isSafeInteger(item.trackId) || item.trackId <= 0)
    return null;
  if (typeof item.trackName !== 'string' || !item.trackName.trim()) return null;
  if (item.kind !== undefined && item.kind !== 'song') return null;

  const artwork = safeUrl(item.artworkUrl100);
  const audioUrl = safeUrl(item.previewUrl);
  return {
    id: `itunes:${item.trackId}`,
    title: item.trackName.trim(),
    artist:
      typeof item.artistName === 'string' && item.artistName.trim()
        ? item.artistName.trim()
        : 'Неизвестный исполнитель',
    album:
      typeof item.collectionName === 'string' && item.collectionName.trim()
        ? item.collectionName.trim()
        : 'Альбом не указан',
    artworkUrl: artwork?.replace(/\/100x100bb\.(jpg|jpeg|png)(?=\?|$)/i, '/600x600bb.$1'),
    durationMs:
      typeof item.trackTimeMillis === 'number' &&
      Number.isFinite(item.trackTimeMillis) &&
      item.trackTimeMillis > 0
        ? item.trackTimeMillis
        : undefined,
    audioUrl,
    sourceUrl: safeUrl(item.trackViewUrl),
    source: 'itunes',
    playbackType: 'preview',
    unavailableReason: audioUrl ? undefined : 'Фрагмент недоступен в iTunes.',
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function copyrightText(value: unknown, symbol: string): string | undefined {
  const item = record(value);
  if (!item) return text(value);
  const label = text(item.text);
  return label ? [symbol, text(item.year), label].filter(Boolean).join(' ') : undefined;
}

function audiusSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, 'https://audius.co');
    if (url.protocol !== 'https:' || url.hostname !== 'audius.co' || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeAudiusTrack(value: unknown): Track | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id)) return null;
  const title = text(item.title);
  const user = record(item.user);
  if (
    !title ||
    item.is_delete === true ||
    item.is_deleted === true ||
    item.is_unlisted === true ||
    item.is_private === true ||
    item.is_scheduled_release === true ||
    user?.is_deactivated === true
  )
    return null;
  const conditions = record(item.stream_conditions);
  const access = record(item.access);
  const authorities = Array.isArray(item.access_authorities) && item.access_authorities.length > 0;
  const restrictedKeys = Array.isArray(item.allowed_api_keys) && item.allowed_api_keys.length > 0;
  const gated = item.is_stream_gated === true || !!conditions || authorities || restrictedKeys;
  const unavailable = item.is_available === false || user?.is_available === false;
  const open =
    item.is_streamable === true &&
    item.is_stream_gated === false &&
    !gated &&
    !unavailable &&
    access?.stream !== false;
  const artwork = record(item.artwork);
  const album = record(item.album_backlink);
  const licenseUrl =
    safeUrl(item.license_url) ??
    safeUrl(item.license) ??
    (item.license == null ? 'https://audius.org/open-music-license.pdf' : undefined);
  const copyright =
    [copyrightText(item.copyright_line, '©'), copyrightText(item.producer_copyright_line, '℗')]
      .filter(Boolean)
      .join(' · ') || undefined;
  return {
    id: `audius:${item.id}`,
    title,
    artist: text(user?.name) ?? text(user?.handle) ?? 'Неизвестный исполнитель',
    album:
      text(album?.playlist_name) ??
      text(album?.name) ??
      text(album?.title) ??
      text(item.album_name) ??
      'Сингл',
    artworkUrl:
      safeUrl(artwork?.['480x480']) ??
      safeUrl(artwork?.['1000x1000']) ??
      safeUrl(artwork?.['150x150']) ??
      safeUrl(artwork?._480x480),
    durationMs:
      typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0
        ? item.duration * 1000
        : undefined,
    audioUrl: open
      ? `https://api.audius.co/v1/tracks/${item.id}/stream?app_name=Melodia`
      : undefined,
    sourceUrl: audiusSourceUrl(item.permalink),
    source: 'audius',
    playbackType: 'full',
    unavailableReason: open
      ? undefined
      : unavailable
        ? 'Автор ограничил доступ к этому треку в приложениях.'
        : conditions && record(conditions.usdc_purchase)
          ? 'Этот трек доступен после покупки на Audius.'
          : gated
            ? 'Автор ограничил доступ. Откройте трек на Audius.'
            : 'Этот трек сейчас недоступен для воспроизведения.',
    licenseUrl,
    copyright,
  };
}

async function requestMusic(
  url: string,
  limit: number | undefined,
  signal: AbortSignal,
  source: MusicSource,
): Promise<MusicResult> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.');
  }
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Сервис получил слишком много запросов. Попробуйте немного позже.'
        : 'Музыкальный сервис временно недоступен. Попробуйте ещё раз.',
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Не удалось прочитать ответ музыкального сервиса.');
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { results?: unknown }).results)
  ) {
    throw new Error('Музыкальный сервис вернул некорректный ответ.');
  }
  const rawResults = (body as { results: unknown[] }).results;
  const responseSource = (body as { source?: unknown }).source;
  if (responseSource !== undefined && responseSource !== source)
    throw new Error('Музыкальный сервис вернул данные другого источника. Повторите поиск.');
  const seen = new Set<string>();
  const tracks = rawResults.flatMap((value) => {
    const track = source === 'audius' ? normalizeAudiusTrack(value) : normalizeItunesTrack(value);
    if (!track || seen.has(track.id)) return [];
    seen.add(track.id);
    return [track];
  });
  const truncated = (body as { truncated?: unknown }).truncated;
  return {
    tracks,
    truncated:
      typeof truncated === 'boolean'
        ? truncated
        : limit !== undefined && rawResults.length >= limit,
  };
}

function abortError() {
  return new DOMException('Запрос отменён', 'AbortError');
}

function loadMusic(
  url: string,
  limit: number | undefined,
  signal?: AbortSignal,
  source: MusicSource = 'itunes',
): Promise<MusicResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const key = url;
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now()) return Promise.resolve(saved.result);
  cache.delete(key);

  let request = pendingRequests.get(key);
  if (!request || request.controller.signal.aborted) {
    const controller = new AbortController();
    const nextRequest: PendingRequest = {
      controller,
      promise: requestMusic(url, limit, controller.signal, source),
      subscribers: 0,
      settled: false,
    };
    request = nextRequest;
    pendingRequests.set(key, nextRequest);
    void nextRequest.promise
      .then(
        (result) => {
          cache.set(key, { result, expiresAt: Date.now() + CACHE_DURATION });
          if (cache.size > 40) cache.delete(cache.keys().next().value!);
        },
        () => undefined,
      )
      .finally(() => {
        nextRequest.settled = true;
        if (pendingRequests.get(key) === nextRequest) pendingRequests.delete(key);
      });
  }

  const activeRequest = request;
  clearTimeout(activeRequest.abortTimer);
  activeRequest.subscribers += 1;

  return new Promise<MusicResult>((resolve, reject) => {
    let finished = false;
    const release = () => {
      signal?.removeEventListener('abort', onAbort);
      activeRequest.subscribers -= 1;
      if (!activeRequest.subscribers && !activeRequest.settled) {
        // Один такт позволяет повторному эффекту StrictMode использовать тот же запрос.
        activeRequest.abortTimer = setTimeout(() => {
          if (!activeRequest.subscribers && !activeRequest.settled)
            activeRequest.controller.abort();
        }, 0);
      }
    };
    const onAbort = () => {
      if (finished) return;
      finished = true;
      release();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    activeRequest.promise.then(
      (result) => {
        if (finished) return;
        finished = true;
        release();
        resolve(result);
      },
      (error: unknown) => {
        if (finished) return;
        finished = true;
        release();
        reject(error);
      },
    );
  });
}

export function searchMusic(
  query: string,
  signal?: AbortSignal,
  source: MusicSource = 'itunes',
): Promise<MusicResult> {
  const term = query.trim().replace(/\s+/g, ' ');
  if (!term) return Promise.resolve({ tracks: [], truncated: false });
  const params = new URLSearchParams({ term, limit: String(SEARCH_LIMIT), source });
  return loadMusic(`/api/music?${params}`, SEARCH_LIMIT, signal, source);
}

export function getDiscoverMusic(
  signal?: AbortSignal,
  source: MusicSource = 'itunes',
): Promise<MusicResult> {
  return loadMusic(`/api/discover?source=${source}`, undefined, signal, source);
}
