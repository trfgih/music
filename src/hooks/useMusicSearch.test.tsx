import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchMusic } from '../services/music';
import type { MusicResult, MusicSource, Track } from '../types';
import { useMusicSearch } from './useMusicSearch';

vi.mock('../services/music', () => ({ searchMusic: vi.fn() }));
const mockedSearch = vi.mocked(searchMusic);
const track: Track = {
  id: 'audius:1',
  title: 'Трек',
  artist: 'Исполнитель',
  album: 'Альбом',
  source: 'audius',
  playbackType: 'full',
};
const result: MusicResult = { tracks: [track], truncated: false };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe('useMusicSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSearch.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('отправляет только последний запрос после задержки 350 мс', async () => {
    mockedSearch.mockResolvedValue(result);
    const onSearch = vi.fn();
    const hook = renderHook(({ query }) => useMusicSearch(query, onSearch), {
      initialProps: { query: 'D' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    hook.rerender({ query: 'Daft Punk' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(mockedSearch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch.mock.calls[0][0]).toBe('Daft Punk');
    expect(mockedSearch.mock.calls[0][2]).toBe('itunes');
    expect(hook.result.current.tracks).toEqual([track]);
    expect(hook.result.current.completedQuery).toBe('Daft Punk');
    expect(onSearch).toHaveBeenCalledWith('Daft Punk');
  });

  it('отменяет старый запрос и не показывает его ответ после нового', async () => {
    const previous = deferred<MusicResult>();
    const latest = deferred<MusicResult>();
    mockedSearch.mockReturnValueOnce(previous.promise).mockReturnValueOnce(latest.promise);
    const onSearch = vi.fn();
    const hook = renderHook(({ query }) => useMusicSearch(query, onSearch), {
      initialProps: { query: 'старый' },
    });
    await debounce();
    const oldSignal = mockedSearch.mock.calls[0][1];
    hook.rerender({ query: 'новый' });
    expect(oldSignal?.aborted).toBe(true);
    await debounce();
    const newestTrack = { ...track, id: 'audius:2', title: 'Новое' };
    await act(async () => {
      latest.resolve({ tracks: [newestTrack], truncated: false });
    });
    await act(async () => {
      previous.resolve(result);
    });
    expect(hook.result.current.tracks).toEqual([newestTrack]);
    expect(hook.result.current.completedQuery).toBe('новый');
    expect(onSearch.mock.calls).toEqual([['новый']]);
  });

  it('игнорирует ошибку устаревшего запроса', async () => {
    const previous = deferred<MusicResult>();
    mockedSearch.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(result);
    const hook = renderHook(({ query }) => useMusicSearch(query), {
      initialProps: { query: 'старый' },
    });
    await debounce();
    hook.rerender({ query: 'новый' });
    await debounce();
    await act(async () => {
      previous.reject(new Error('Старая ошибка'));
    });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.completedQuery).toBe('новый');
  });

  it('сохраняет успешные данные при сбое и повторяет текущий запрос', async () => {
    mockedSearch
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new Error('Нет сети'))
      .mockResolvedValueOnce({ tracks: [], truncated: false });
    const onSearch = vi.fn();
    const hook = renderHook(({ query }) => useMusicSearch(query, onSearch), {
      initialProps: { query: 'успешный' },
    });
    await debounce();
    hook.rerender({ query: 'другой' });
    await debounce();
    expect(hook.result.current.tracks).toEqual([track]);
    expect(hook.result.current.error).toBe('Нет сети');
    expect(hook.result.current.completedQuery).toBe('успешный');
    expect(onSearch.mock.calls).toEqual([['успешный']]);
    act(() => hook.result.current.retry());
    await debounce();
    expect(hook.result.current.tracks).toEqual([]);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.completedQuery).toBe('другой');
    expect(onSearch.mock.calls).toEqual([['успешный'], ['другой']]);
  });

  it('очищает поиск и отменяет запрос при пустом поле', async () => {
    const pending = deferred<MusicResult>();
    mockedSearch.mockReturnValueOnce(pending.promise);
    const hook = renderHook(({ query }) => useMusicSearch(query), {
      initialProps: { query: 'музыка' },
    });
    await debounce();
    const signal = mockedSearch.mock.calls[0][1];
    hook.rerender({ query: '   ' });
    expect(signal?.aborted).toBe(true);
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.completedQuery).toBe('');
    await act(async () => {
      pending.resolve(result);
    });
    expect(hook.result.current.tracks).toEqual([]);
  });

  it('смена обработчика не перезапускает поиск и использует свежий обработчик', async () => {
    mockedSearch.mockResolvedValue(result);
    const oldCallback = vi.fn();
    const newCallback = vi.fn();
    const hook = renderHook(({ callback }) => useMusicSearch('музыка', callback), {
      initialProps: { callback: oldCallback },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    hook.rerender({ callback: newCallback });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback).toHaveBeenCalledWith('музыка');
  });

  it('сбрасывает выдачу при смене источника и повторяет поиск в выбранном каталоге', async () => {
    const itunesTrack: Track = {
      ...track,
      id: 'itunes:3',
      source: 'itunes',
      playbackType: 'preview',
    };
    mockedSearch
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new Error('iTunes временно недоступен'))
      .mockResolvedValueOnce({ tracks: [itunesTrack], truncated: false });
    const hook = renderHook(
      ({ source }) => useMusicSearch('одинаковый запрос', undefined, source),
      {
        initialProps: { source: 'audius' as MusicSource },
      },
    );
    await debounce();
    expect(hook.result.current.tracks).toEqual([track]);
    const oldSignal = mockedSearch.mock.calls[0][1];
    hook.rerender({ source: 'itunes' });
    expect(oldSignal?.aborted).toBe(true);
    expect(hook.result.current.tracks).toEqual([]);
    expect(hook.result.current.completedQuery).toBe('');
    await debounce();
    expect(mockedSearch.mock.calls[1][2]).toBe('itunes');
    expect(hook.result.current.error).toBe('iTunes временно недоступен');
    expect(hook.result.current.tracks).toEqual([]);
    act(() => hook.result.current.retry());
    await debounce();
    expect(mockedSearch.mock.calls[2][2]).toBe('itunes');
    expect(hook.result.current.tracks).toEqual([itunesTrack]);
    expect(hook.result.current.error).toBeNull();
  });

  it('не принимает поздний ответ предыдущего источника для того же запроса', async () => {
    const pendingAudius = deferred<MusicResult>();
    const itunesTrack: Track = {
      ...track,
      id: 'itunes:4',
      source: 'itunes',
      playbackType: 'preview',
    };
    mockedSearch
      .mockReturnValueOnce(pendingAudius.promise)
      .mockResolvedValueOnce({ tracks: [itunesTrack], truncated: false });
    const onSearch = vi.fn();
    const hook = renderHook(({ source }) => useMusicSearch('музыка', onSearch, source), {
      initialProps: { source: 'audius' as MusicSource },
    });
    await debounce();
    hook.rerender({ source: 'itunes' });
    await debounce();
    await act(async () => {
      pendingAudius.resolve(result);
    });
    expect(hook.result.current.tracks).toEqual([itunesTrack]);
    expect(hook.result.current.completedQuery).toBe('музыка');
    expect(onSearch.mock.calls).toEqual([['музыка']]);
  });
});
