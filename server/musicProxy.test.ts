// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMusicMiddleware } from './musicProxy';

const track = {
  id: 'D7KyD',
  title: 'Публичный трек',
  duration: 210,
  user: { id: 'artist1', name: 'Автор', wallet: 'private-wallet' },
  is_streamable: true,
  is_stream_gated: false,
  is_available: true,
  is_delete: false,
  is_unlisted: false,
  stream_conditions: null,
  artwork: { '480x480': 'https://creator.audius.co/art.jpg' },
  permalink: '/artist/track',
  stream: { url: 'https://creator.audius.co/signed' },
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

async function run(
  middleware: ReturnType<typeof createMusicMiddleware>,
  url: string,
  method = 'GET',
) {
  const headers: Record<string, string> = {};
  let body = '';
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    end(value: string) {
      body = value;
    },
  };
  const next = vi.fn();
  await middleware({ url, method } as IncomingMessage, res as unknown as ServerResponse, next);
  return { status: res.statusCode, headers, body: body ? JSON.parse(body) : undefined, next };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('серверный музыкальный сервис', () => {
  it('возвращает каталог Apple по умолчанию без указания источника', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [{ trackId: 123, trackName: 'Песня Apple' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await run(createMusicMiddleware(), '/api/music?term=Apple');
    expect(result.status).toBe(200);
    expect(result.body.source).toBe('itunes');
    expect(new URL(fetchMock.mock.calls[0][0]).hostname).toBe('itunes.apple.com');
  });

  it('ищет в выбранном Audius, передаёт документированные параметры и удаляет служебные данные', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          track,
          {
            ...track,
            id: 'gated',
            is_stream_gated: true,
            allowed_api_keys: ['private-app-key'],
            access_authorities: ['private-gate-wallet'],
            stream_conditions: {
              usdc_purchase: { price: 10, splits: [{ address: 'private-pay-wallet' }] },
            },
          },
          { ...track, id: 'private', is_private: true },
          { ...track, id: 'unlisted', is_unlisted: true },
          { ...track, id: 'deleted', is_delete: true },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await run(
      createMusicMiddleware(),
      '/api/music?source=audius&term=drum%20%26%20bass&limit=30',
    );
    const upstream = new URL(fetchMock.mock.calls[0][0]);
    expect(upstream.origin + upstream.pathname).toBe('https://api.audius.co/v1/tracks/search');
    expect(upstream.searchParams.get('query')).toBe('drum & bass');
    expect(upstream.searchParams.get('sort_method')).toBe('relevant');
    expect(upstream.searchParams.get('app_name')).toBe('Melodia');
    expect(result.body).toMatchObject({ source: 'audius', resultCount: 2, truncated: false });
    expect(result.body.results[0].stream).toBeUndefined();
    expect(result.body.results[0].user.wallet).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('private-');
    expect(result.body.results[1]).toMatchObject({
      allowed_api_keys: ['restricted'],
      access_authorities: ['restricted'],
      stream_conditions: { usdc_purchase: {} },
    });
  });

  it('выбирает 24 разных открытых исполнителя для подборки', async () => {
    const tracks = Array.from({ length: 30 }, (_, index) => ({
      ...track,
      id: `track${index}`,
      user: { id: `artist${index}`, name: `Автор ${index}` },
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { ...track, id: 'locked', is_stream_gated: true },
            tracks[0],
            tracks[0],
            ...tracks,
          ],
        }),
      ),
    );
    const result = await run(createMusicMiddleware(), '/api/discover?source=audius');
    expect(result.body.results).toHaveLength(24);
    expect(new Set(result.body.results.map((value: typeof track) => value.user.id)).size).toBe(24);
    expect(
      result.body.results.every((value: typeof track) => value.is_stream_gated === false),
    ).toBe(true);
  });

  it('объединяет одинаковые запросы, раздельно кэширует источники и обновляет Audius через пять минут', async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [{ trackId: 1 }] }))
      .mockResolvedValue(jsonResponse({ data: [track] }));
    vi.stubGlobal('fetch', fetchMock);
    const middleware = createMusicMiddleware();
    const first = run(middleware, '/api/music?source=audius&term=same');
    const second = run(middleware, '/api/music?source=audius&term=same');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse({ data: [track] }));
    await Promise.all([first, second]);
    await run(middleware, '/api/music?source=audius&term=same');
    const preview = await run(middleware, '/api/music?source=itunes&term=same');
    expect(preview.body.source).toBe('itunes');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await run(middleware, '/api/music?source=audius&term=same');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ограничивает keyless запросы Audius и восстанавливает доступ после окна', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const middleware = createMusicMiddleware();
    for (let index = 0; index < 5; index++) {
      expect((await run(middleware, `/api/music?source=audius&term=query${index}`)).status).toBe(
        200,
      );
    }
    const limited = await run(middleware, '/api/music?source=audius&term=next');
    expect(limited.status).toBe(429);
    expect(limited.headers['Retry-After']).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(1001);
    expect((await run(middleware, '/api/music?source=audius&term=next')).status).toBe(200);
  });

  it('валидирует источник и не кэширует неудачный ответ', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ wrong: [] }))
      .mockResolvedValue(jsonResponse({ data: [track] }));
    vi.stubGlobal('fetch', fetchMock);
    const middleware = createMusicMiddleware();
    expect((await run(middleware, '/api/music?source=other&term=q')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await run(middleware, '/api/music?source=audius&term=q')).status).toBe(502);
    expect((await run(middleware, '/api/music?source=audius&term=q')).status).toBe(200);
  });
});
