import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rawTrack = {
  kind: 'song',
  trackId: 123,
  trackName: 'One More Time',
  artistName: 'Daft Punk',
  collectionName: 'Discovery',
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg',
  trackTimeMillis: 320000,
  previewUrl: 'http://audio.example.com/sample.m4a',
  trackViewUrl: 'https://music.apple.com/album/123',
};

function response(results: unknown[], source?: 'audius' | 'itunes') {
  return new Response(JSON.stringify({ source, resultCount: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('музыкальный сервис', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('приводит записи к Track, убирает дубликаты и запрашивает максимум 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        rawTrack,
        rawTrack,
        {
          ...rawTrack,
          trackId: 124,
          trackTimeMillis: undefined,
          artworkUrl100: 'javascript:alert(1)',
          previewUrl: undefined,
        },
        { ...rawTrack, trackId: 125, kind: 'music-video' },
        { trackName: 'Без идентификатора' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic } = await import('./music');
    const result = await searchMusic('  Daft   Punk  ');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/music?term=Daft+Punk&limit=200&source=itunes');
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toMatchObject({
      id: 'itunes:123',
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      durationMs: 320000,
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/cover/600x600bb.jpg',
      audioUrl: 'https://audio.example.com/sample.m4a',
      source: 'itunes',
      playbackType: 'preview',
    });
    expect(result.tracks[1].durationMs).toBeUndefined();
    expect(result.tracks[1].artworkUrl).toBeUndefined();
    expect(result.tracks[1].audioUrl).toBeUndefined();
    expect(result.truncated).toBe(false);
  });

  it('указывает ограниченную выдачу и повторно использует успешный ответ', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(Array.from({ length: 200 }, (_, index) => ({ ...rawTrack, trackId: index + 1 }))),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic } = await import('./music');
    const first = await searchMusic('много', undefined, 'itunes');
    const second = await searchMusic('много', undefined, 'itunes');
    expect(first.truncated).toBe(true);
    expect(second.tracks).toHaveLength(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('загружает подборку отдельным запросом без признака ограничения выдачи', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response([rawTrack, { ...rawTrack, trackId: 124, artistName: 'Другой исполнитель' }]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { getDiscoverMusic } = await import('./music');
    const discovery = await getDiscoverMusic();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/discover?source=itunes');
    expect(discovery.tracks).toHaveLength(2);
    expect(discovery.tracks[0].id).toBe('itunes:123');
    expect(discovery.truncated).toBe(false);
    await getDiscoverMusic();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('возвращает понятную ошибку сервиса и допускает повторный запрос', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(response([rawTrack]));
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic } = await import('./music');
    await expect(searchMusic('повтор', undefined, 'itunes')).rejects.toThrow('временно недоступен');
    expect((await searchMusic('повтор', undefined, 'itunes')).tracks).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('отклоняет некорректный ответ вместо ложной пустой выдачи', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Сбой' }), { status: 200 })),
    );
    const { searchMusic } = await import('./music');
    await expect(searchMusic('данные')).rejects.toThrow('некорректный ответ');
  });

  it('совместно использует запрос и отменяет его после ухода последнего подписчика', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Отмена', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic } = await import('./music');
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = searchMusic('общий', firstController.signal);
    const second = searchMusic('общий', secondController.signal);
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    firstController.abort();
    await firstRejection;
    await vi.advanceTimersByTimeAsync(1);
    const underlying = fetchMock.mock.calls[0][1].signal;
    expect(underlying?.aborted).toBe(false);
    const secondRejection = expect(second).rejects.toMatchObject({ name: 'AbortError' });
    secondController.abort();
    await secondRejection;
    await vi.advanceTimersByTimeAsync(1);
    expect(underlying?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const audiusTrack = {
  id: 'D7KyD',
  title: 'Полный трек',
  duration: 214,
  user: { id: 'artist1', name: 'Исполнитель', handle: 'artist', is_available: true },
  permalink: '/artist/full-track',
  artwork: { '480x480': 'https://creator.audius.co/content/art/480x480.jpg' },
  is_streamable: true,
  is_stream_gated: false,
  is_available: true,
  access: { stream: true },
  stream_conditions: null,
  allowed_api_keys: null,
  access_authorities: null,
};

describe('полные треки Audius', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('явно запрашивает Audius и сохраняет полную длительность и реальные ссылки', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        [
          {
            ...audiusTrack,
            album_backlink: { playlist_name: 'Настоящий альбом' },
            license: 'https://creativecommons.org/licenses/by/4.0/',
            copyright_line: { year: '2026', text: 'Автор' },
            producer_copyright_line: { year: '2026', text: 'Лейбл' },
          },
          {
            ...audiusTrack,
            id: 'q9Zwx',
            artwork: { '480x480': 'javascript:alert(1)' },
            permalink: '//unsafe.example/track',
          },
        ],
        'audius',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic } = await import('./music');
    const result = await searchMusic('Полный трек', undefined, 'audius');
    expect(fetchMock.mock.calls[0][0]).toContain('source=audius');
    expect(result.tracks[0]).toMatchObject({
      id: 'audius:D7KyD',
      album: 'Настоящий альбом',
      durationMs: 214000,
      source: 'audius',
      playbackType: 'full',
      audioUrl: 'https://api.audius.co/v1/tracks/D7KyD/stream?app_name=Melodia',
      sourceUrl: 'https://audius.co/artist/full-track',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      copyright: '© 2026 Автор · ℗ 2026 Лейбл',
    });
    expect(result.tracks[1].album).toBe('Сингл');
    expect(result.tracks[1].artworkUrl).toBeUndefined();
    expect(result.tracks[1].sourceUrl).toBeUndefined();
  });

  it('не выдаёт аудио закрытым, платным, отключённым для API и не подтверждённым как открытые записям', async () => {
    const restrictions = [
      { is_stream_gated: true },
      { stream_conditions: { usdc_purchase: { price: 5 } } },
      { access_authorities: ['0x123'] },
      { allowed_api_keys: ['another-app'] },
      { is_available: false },
      { user: { ...audiusTrack.user, is_available: false } },
      { access: { stream: false } },
      { is_streamable: false },
      { is_stream_gated: undefined },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          restrictions.map((fields, index) => ({
            ...audiusTrack,
            ...fields,
            id: `locked${index}`,
            preview: { url: 'https://example.com/preview.mp3' },
            stream: { url: 'https://example.com/private.mp3' },
          })),
        ),
      ),
    );
    const { searchMusic } = await import('./music');
    const result = await searchMusic('закрытые', undefined, 'audius');
    expect(result.tracks).toHaveLength(restrictions.length);
    for (const track of result.tracks) {
      expect(track.audioUrl).toBeUndefined();
      expect(track.unavailableReason).toBeTruthy();
    }
    expect(result.tracks[1].unavailableReason).toContain('покупки');
  });

  it('скрывает удалённые, приватные, неопубликованные и неверные записи', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response([
          audiusTrack,
          audiusTrack,
          ...['is_delete', 'is_deleted', 'is_unlisted', 'is_private', 'is_scheduled_release'].map(
            (flag, index) => ({
              ...audiusTrack,
              id: `hidden${index}`,
              [flag]: true,
            }),
          ),
          { ...audiusTrack, id: '../hidden' },
          {
            ...audiusTrack,
            id: 'deactivated',
            user: { ...audiusTrack.user, is_deactivated: true },
          },
        ]),
      ),
    );
    const { searchMusic } = await import('./music');
    expect(
      (await searchMusic('видимые', undefined, 'audius')).tracks.map((track) => track.id),
    ).toEqual(['audius:D7KyD']);
  });

  it('изолирует запросы и кэш разных источников', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(response(url.includes('source=itunes') ? [rawTrack] : [audiusTrack])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { searchMusic, getDiscoverMusic } = await import('./music');
    const [full, preview] = await Promise.all([
      searchMusic('одинаковый', undefined, 'audius'),
      searchMusic('одинаковый', undefined, 'itunes'),
    ]);
    expect(full.tracks[0].id).toBe('audius:D7KyD');
    expect(preview.tracks[0].id).toBe('itunes:123');
    await Promise.all([
      searchMusic('одинаковый', undefined, 'audius'),
      searchMusic('одинаковый', undefined, 'itunes'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getDiscoverMusic(undefined, 'audius');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/discover?source=audius');
  });

  it('отклоняет ответ другого источника', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ source: 'itunes', results: [rawTrack] }))),
    );
    const { searchMusic } = await import('./music');
    await expect(searchMusic('проверка', undefined, 'audius')).rejects.toThrow('другого источника');
  });
});
