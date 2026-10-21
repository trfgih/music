import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../types';

const FAVORITES_KEY = 'melodia:favorites';
const HISTORY_KEY = 'melodia:history';
const STORAGE_WARNING =
  'Не удалось сохранить данные в этом браузере. Избранное доступно до закрытия страницы.';

interface LibraryState {
  favorites: Track[];
  history: string[];
  storageError: string | null;
}

function storedUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function readTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object') return null;
  const track = value as Record<string, unknown>;
  if (typeof track.id !== 'string' || !track.id.trim() || track.id.length > 128) return null;
  if (typeof track.title !== 'string' || !track.title.trim()) return null;
  if (typeof track.artist !== 'string' || typeof track.album !== 'string') return null;
  const source =
    track.source === 'audius' || track.source === 'itunes'
      ? track.source
      : track.id.startsWith('itunes:')
        ? 'itunes'
        : track.id.startsWith('audius:')
          ? 'audius'
          : undefined;
  const playbackType =
    track.playbackType === 'full' || track.playbackType === 'preview'
      ? track.playbackType
      : source === 'itunes'
        ? 'preview'
        : source === 'audius'
          ? 'full'
          : undefined;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artworkUrl: storedUrl(track.artworkUrl),
    audioUrl: storedUrl(track.audioUrl ?? track.previewUrl),
    sourceUrl: storedUrl(track.sourceUrl ?? track.storeUrl),
    source,
    playbackType,
    licenseUrl: storedUrl(track.licenseUrl),
    copyright:
      typeof track.copyright === 'string' && track.copyright.trim()
        ? track.copyright.trim().slice(0, 1000)
        : undefined,
    unavailableReason:
      typeof track.unavailableReason === 'string' && track.unavailableReason.trim()
        ? track.unavailableReason.trim().slice(0, 500)
        : undefined,
    durationMs:
      typeof track.durationMs === 'number' &&
      Number.isFinite(track.durationMs) &&
      track.durationMs > 0
        ? track.durationMs
        : undefined,
  };
}

function readFavorites(value: unknown): Track[] {
  if (!Array.isArray(value)) throw new Error('Некорректное избранное');
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const track = readTrack(item);
    if (!track || seen.has(track.id)) return [];
    seen.add(track.id);
    return [track];
  });
}

function readHistory(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Некорректная история');
  const seen = new Set<string>();
  return value
    .flatMap((item) => {
      if (typeof item !== 'string') return [];
      const query = item.trim().replace(/\s+/g, ' ').slice(0, 200);
      const key = query.toLocaleLowerCase('ru');
      if (!query || seen.has(key)) return [];
      seen.add(key);
      return [query];
    })
    .slice(0, 8);
}

function readStorage(): LibraryState {
  const state: LibraryState = { favorites: [], history: [], storageError: null };
  for (const key of [FAVORITES_KEY, HISTORY_KEY]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      const parsed: unknown = JSON.parse(raw);
      if (key === FAVORITES_KEY) state.favorites = readFavorites(parsed);
      else state.history = readHistory(parsed);
    } catch {
      state.storageError =
        'Сохранённые данные недоступны. Вы можете продолжить пользоваться приложением.';
    }
  }
  return state;
}

function saveStorage(key: string, value: Track[] | string[]): string | null {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch {
    return STORAGE_WARNING;
  }
}

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(readStorage);
  const currentState = useRef(state);
  currentState.current = state;

  const commit = useCallback((nextState: LibraryState) => {
    currentState.current = nextState;
    setState(nextState);
  }, []);

  const toggleFavorite = useCallback(
    (track: Track) => {
      const previous = currentState.current;
      const exists = previous.favorites.some((favorite) => favorite.id === track.id);
      const favorites = exists
        ? previous.favorites.filter((favorite) => favorite.id !== track.id)
        : [track, ...previous.favorites];
      commit({ ...previous, favorites, storageError: saveStorage(FAVORITES_KEY, favorites) });
    },
    [commit],
  );

  const rememberSearch = useCallback(
    (value: string) => {
      const query = value.trim().replace(/\s+/g, ' ').slice(0, 200);
      if (!query) return;
      const previous = currentState.current;
      const normalized = query.toLocaleLowerCase('ru');
      const history = [
        query,
        ...previous.history.filter((item) => item.toLocaleLowerCase('ru') !== normalized),
      ].slice(0, 8);
      commit({ ...previous, history, storageError: saveStorage(HISTORY_KEY, history) });
    },
    [commit],
  );

  const clearHistory = useCallback(() => {
    const previous = currentState.current;
    commit({ ...previous, history: [], storageError: saveStorage(HISTORY_KEY, []) });
  }, [commit]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== FAVORITES_KEY && event.key !== HISTORY_KEY) return;
      commit(readStorage());
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, [commit]);

  const favoriteIds = useMemo(
    () => new Set(state.favorites.map((track) => track.id)),
    [state.favorites],
  );
  const isFavorite = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);
  return { ...state, isFavorite, toggleFavorite, rememberSearch, clearHistory };
}
