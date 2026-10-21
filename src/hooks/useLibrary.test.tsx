import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../types';
import { useLibrary } from './useLibrary';

const track: Track = {
  id: 'itunes:42',
  title: 'One More Time',
  artist: 'Daft Punk',
  album: 'Discovery',
  artworkUrl: 'https://example.com/art.jpg',
  audioUrl: 'https://example.com/preview.m4a',
  source: 'itunes',
  playbackType: 'preview',
  durationMs: 320000,
};

describe('useLibrary', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('сохраняет избранное после нового открытия и удаляет по общему идентификатору', () => {
    const first = renderHook(useLibrary);
    act(() => first.result.current.toggleFavorite(track));
    expect(first.result.current.isFavorite(track.id)).toBe(true);
    first.unmount();
    const reopened = renderHook(useLibrary);
    expect(reopened.result.current.favorites).toEqual([track]);
    act(() =>
      reopened.result.current.toggleFavorite({ ...track, title: 'Название в другом списке' }),
    );
    expect(reopened.result.current.isFavorite(track.id)).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('melodia:favorites')!)).toEqual([]);
  });

  it('хранит восемь последних запросов, переносит повтор наверх и очищает историю', () => {
    const hook = renderHook(useLibrary);
    act(() => {
      for (let i = 1; i <= 10; i += 1) hook.result.current.rememberSearch(`Запрос ${i}`);
      hook.result.current.rememberSearch('   запрос   5   ');
      hook.result.current.rememberSearch(' ');
    });
    expect(hook.result.current.history).toEqual([
      'запрос 5',
      'Запрос 10',
      'Запрос 9',
      'Запрос 8',
      'Запрос 7',
      'Запрос 6',
      'Запрос 4',
      'Запрос 3',
    ]);
    act(() => hook.result.current.clearHistory());
    expect(hook.result.current.history).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem('melodia:history')!)).toEqual([]);
  });

  it('выдерживает повреждённое хранилище и сохраняет новую историю', () => {
    window.localStorage.setItem('melodia:favorites', '{повреждено');
    window.localStorage.setItem(
      'melodia:history',
      JSON.stringify(['Трек', 17, '', 'трек', 'Исполнитель']),
    );
    const hook = renderHook(useLibrary);
    expect(hook.result.current.favorites).toEqual([]);
    expect(hook.result.current.history).toEqual(['Трек', 'Исполнитель']);
    expect(hook.result.current.storageError).toBeTruthy();
    act(() => hook.result.current.toggleFavorite(track));
    expect(hook.result.current.favorites).toEqual([track]);
  });

  it('отбрасывает некорректные треки, дубликаты и небезопасные ссылки', () => {
    window.localStorage.setItem(
      'melodia:favorites',
      JSON.stringify([
        { ...track, artworkUrl: 'javascript:alert(1)', audioUrl: 'http://example.com/music' },
        track,
        { id: 'wrong', title: 123 },
        null,
      ]),
    );
    const hook = renderHook(useLibrary);
    expect(hook.result.current.favorites).toHaveLength(1);
    expect(hook.result.current.favorites[0].artworkUrl).toBeUndefined();
    expect(hook.result.current.favorites[0].audioUrl).toBeUndefined();
  });

  it('позволяет пользоваться избранным и историей при запрете записи', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Недостаточно места', 'QuotaExceededError');
    });
    const hook = renderHook(useLibrary);
    act(() => hook.result.current.toggleFavorite(track));
    expect(hook.result.current.favorites).toEqual([track]);
    expect(hook.result.current.storageError).toBeTruthy();
    act(() => hook.result.current.rememberSearch('Daft Punk'));
    expect(hook.result.current.history).toEqual(['Daft Punk']);
    act(() => hook.result.current.toggleFavorite(track));
    expect(hook.result.current.favorites).toEqual([]);
  });

  it('обновляет избранное после изменения в другой вкладке', () => {
    const hook = renderHook(useLibrary);
    window.localStorage.setItem('melodia:favorites', JSON.stringify([track]));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'melodia:favorites' })));
    expect(hook.result.current.isFavorite(track.id)).toBe(true);
  });

  it('восстанавливает старое избранное iTunes без потери фрагмента и обновляет формат при сохранении', () => {
    const legacy = {
      id: 'itunes:42',
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUrl: track.artworkUrl,
      durationMs: track.durationMs,
      previewUrl: track.audioUrl,
      storeUrl: 'https://music.apple.com/us/album/discovery/42',
    };
    window.localStorage.setItem('melodia:favorites', JSON.stringify([legacy]));
    const hook = renderHook(useLibrary);
    expect(hook.result.current.favorites[0]).toMatchObject({
      id: legacy.id,
      audioUrl: legacy.previewUrl,
      sourceUrl: legacy.storeUrl,
      source: 'itunes',
      playbackType: 'preview',
      durationMs: legacy.durationMs,
    });
    expect(hook.result.current.isFavorite(legacy.id)).toBe(true);
    const fullTrack: Track = {
      id: 'audius:abc',
      title: 'Полная композиция',
      artist: 'Автор',
      album: 'Audius',
      source: 'audius',
      playbackType: 'full',
      audioUrl: 'https://api.audius.co/v1/tracks/abc/stream',
      sourceUrl: 'https://audius.co/author/track',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      copyright: 'Автор',
    };
    act(() => hook.result.current.toggleFavorite(fullTrack));
    const saved = JSON.parse(window.localStorage.getItem('melodia:favorites')!);
    expect(saved[1].audioUrl).toBe(legacy.previewUrl);
    expect(saved[1].previewUrl).toBeUndefined();
    expect(saved[1].storeUrl).toBeUndefined();
    hook.unmount();
    const reopened = renderHook(useLibrary);
    expect(reopened.result.current.favorites[0]).toEqual(fullTrack);
    expect(reopened.result.current.favorites[1].source).toBe('itunes');
  });

  it('сохраняет проверенные сведения о недоступности и лицензии полного трека', () => {
    window.localStorage.setItem(
      'melodia:favorites',
      JSON.stringify([
        {
          id: 'audius:private',
          title: 'Закрытая композиция',
          artist: 'Автор',
          album: 'Audius',
          source: 'audius',
          playbackType: 'full',
          unavailableReason: 'Автор ограничил доступ',
          copyright: ' © Автор ',
          licenseUrl: 'javascript:alert(1)',
          sourceUrl: 'https://audius.co/author/private',
        },
      ]),
    );
    const hook = renderHook(useLibrary);
    expect(hook.result.current.favorites[0]).toMatchObject({
      source: 'audius',
      playbackType: 'full',
      unavailableReason: 'Автор ограничил доступ',
      copyright: '© Автор',
      sourceUrl: 'https://audius.co/author/private',
    });
    expect(hook.result.current.favorites[0].audioUrl).toBeUndefined();
    expect(hook.result.current.favorites[0].licenseUrl).toBeUndefined();
  });
});
