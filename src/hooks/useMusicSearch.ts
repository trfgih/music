import { useCallback, useEffect, useRef, useState } from 'react';
import { searchMusic } from '../services/music';
import type { MusicSource, Track } from '../types';

interface SearchState {
  source: MusicSource;
  tracks: Track[];
  loading: boolean;
  error: string | null;
  completedQuery: string;
  truncated: boolean;
}

const emptyState = {
  tracks: [],
  loading: false,
  error: null,
  completedQuery: '',
  truncated: false,
};

export function useMusicSearch(
  query: string,
  onSearch?: (query: string) => void,
  source: MusicSource = 'itunes',
) {
  const [state, setState] = useState<SearchState>(() => ({ ...emptyState, source }));
  const [retryCount, setRetryCount] = useState(0);
  const sequence = useRef(0);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const term = query.trim().replace(/\s+/g, ' ');

  useEffect(() => {
    const requestId = ++sequence.current;
    if (!term) {
      setState({ ...emptyState, source });
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({
      ...(previous.source === source ? previous : { ...emptyState, source }),
      loading: true,
      error: null,
    }));
    const timeout = setTimeout(async () => {
      let result;
      try {
        result = await searchMusic(term, controller.signal, source);
      } catch (error) {
        if (controller.signal.aborted || requestId !== sequence.current) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить музыку. Попробуйте ещё раз.',
        }));
        return;
      }
      if (controller.signal.aborted || requestId !== sequence.current) return;
      setState({
        source,
        tracks: result.tracks,
        loading: false,
        error: null,
        completedQuery: term,
        truncated: result.truncated,
      });
      onSearchRef.current?.(term);
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [term, retryCount, source]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  // Смена каталога сразу скрывает прежнюю выдачу, до выполнения нового эффекта.
  const { tracks, loading, error, completedQuery, truncated } =
    state.source === source ? state : { ...emptyState, loading: Boolean(term) };
  return { tracks, loading, error, completedQuery, truncated, retry };
}
