import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, AudioLines, Check, Search, WifiOff, X } from 'lucide-react';
import { Discover } from './components/Discover';
import { Favorites } from './components/Favorites';
import { Navigation } from './components/Navigation';
import { SearchBox } from './components/SearchBox';
import { TrackList, TrackSkeleton } from './components/TrackList';
import { Player } from './components/Player';
import { SourceSelector } from './components/SourceSelector';
import { MusicCredits } from './components/MusicCredits';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useLibrary } from './hooks/useLibrary';
import { useMusicSearch } from './hooks/useMusicSearch';
import { useTheme } from './hooks/useTheme';
import { getDiscoverMusic } from './services/music';
import type { MusicSource, Section, SortOrder, Track } from './types';

export function App() {
  const [musicSource, setMusicSource] = useState<MusicSource>(initialSource);
  const [section, setSection] = useState<Section>('search');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('relevance');
  const [visibleCount, setVisibleCount] = useState(20);
  const [discover, setDiscover] = useState<Track[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const [toast, setToast] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const library = useLibrary();
  const { theme, toggleTheme } = useTheme();
  const search = useMusicSearch(query, library.rememberSearch, musicSource);
  const player = useAudioPlayer();

  useEffect(() => {
    setDiscover([]);
    try {
      localStorage.setItem('melodia:source:v2', musicSource);
    } catch {
      // Если браузер запретил сохранение, выбор действует до закрытия страницы.
    }
  }, [musicSource]);

  useEffect(() => {
    const controller = new AbortController();
    setDiscoverLoading(true);
    setDiscoverError(null);
    getDiscoverMusic(controller.signal, musicSource)
      .then((result) => {
        if (!controller.signal.aborted) setDiscover(result.tracks);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setDiscoverError(
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить подборку. Попробуйте ещё раз.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiscoverLoading(false);
      });
    return () => controller.abort();
  }, [discoveryAttempt, musicSource]);

  useEffect(() => {
    const online = () => setOffline(false);
    const disconnected = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', disconnected);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setVisibleCount(20);
  }, [section, search.completedQuery, sort]);

  const showResults = section === 'search' && Boolean(query.trim());
  const sourceTracks = useMemo(() => {
    if (section === 'favorites') return library.favorites;
    if (showResults) return search.tracks;
    return discover.slice(0, 8);
  }, [section, library.favorites, showResults, search.tracks, discover]);
  const orderedTracks = useMemo(
    () =>
      sort === 'title'
        ? [...sourceTracks].sort((a, b) => a.title.localeCompare(b.title, 'ru'))
        : sourceTracks,
    [sourceTracks, sort],
  );
  useEffect(() => {
    player.updateQueue(orderedTracks);
  }, [player.updateQueue, orderedTracks]);
  const displayedTracks = orderedTracks.slice(0, visibleCount);
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setSection('search');
  }, []);
  function toggleFavorite(track: Track) {
    setToast(
      library.isFavorite(track.id)
        ? 'Композиция убрана из избранного'
        : 'Композиция добавлена в избранное',
    );
    library.toggleFavorite(track);
  }
  function toggleTrack(track: Track) {
    if (player.selected?.id === track.id) player.toggle();
    else player.select(track, orderedTracks);
  }
  function startTrack(track: Track) {
    if (!track.audioUrl) return;
    if (player.selected?.id === track.id && (player.isPlaying || player.isLoading)) return;
    player.select(track, orderedTracks);
  }
  const listProps = {
    selectedId: player.selected?.id,
    isPlaying: player.isPlaying,
    isLoading: player.isLoading,
    isFavorite: library.isFavorite,
    onFavorite: toggleFavorite,
    onPlay: toggleTrack,
    onStart: startTrack,
  };
  const isHome = section === 'search' && !showResults;
  let listTitle = 'Слушайте прямо сейчас';
  let listEyebrow = 'ОСТАНЬТЕСЬ НА ЭТОЙ ВОЛНЕ';
  if (section === 'favorites') {
    listTitle = 'Любимое всегда рядом';
    listEyebrow = 'ВАША ЛИЧНАЯ КОЛЛЕКЦИЯ';
  } else if (showResults) {
    listTitle = `Музыка по запросу «${search.completedQuery || query.trim()}»`;
    listEyebrow = 'РЕЗУЛЬТАТЫ ПОИСКА';
  }

  let resultCaption = `${orderedTracks.length} ${trackWord(orderedTracks.length)}`;
  if (showResults && search.loading) {
    resultCaption = `Ищем «${query.trim()}»…`;
  } else if (showResults && search.truncated) {
    resultCaption += ' · показана часть результатов';
  }

  return (
    <div className="app-shell">
      <Navigation
        section={section}
        onSection={setSection}
        count={library.favorites.length}
        theme={theme}
        onTheme={toggleTheme}
        source={musicSource}
      />
      <div className="main-shell">
        <header className="topbar">
          <SearchBox
            value={query}
            onChange={changeQuery}
            history={library.history}
            onClearHistory={library.clearHistory}
          />
          <div className="topbar-note">
            <span className="online-dot" />
            Музыка для каждого дня
            <span className="user-avatar">
              <AudioLines size={18} />
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <SourceSelector
            value={musicSource}
            onChange={(source) => {
              setMusicSource(source);
              setSection('search');
            }}
          />
          {offline && (
            <div className="notice offline-notice" role="status">
              <WifiOff size={18} />
              <span>Нет подключения к сети. Загруженная музыка и избранное остаются с вами.</span>
            </div>
          )}
          {library.storageError && (
            <div className="notice" role="status">
              {library.storageError}
            </div>
          )}
          {isHome && (
            <>
              <Discover
                tracks={orderedTracks}
                source={musicSource}
                isFavorite={library.isFavorite}
                onFavorite={toggleFavorite}
                onPlay={toggleTrack}
                onStart={startTrack}
                onQuery={changeQuery}
                selectedId={player.selected?.id}
                isPlaying={player.isPlaying}
                isLoading={player.isLoading}
              />
              {discoverError && (
                <ErrorNotice
                  message={discoverError}
                  onRetry={() => setDiscoveryAttempt((attempt) => attempt + 1)}
                />
              )}
              {discoverLoading && discover.length === 0 && (
                <div
                  className="album-skeleton-grid"
                  aria-label="Загружаем подборку"
                  aria-busy="true"
                >
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="skeleton album-skeleton" />
                  ))}
                </div>
              )}
            </>
          )}
          <section
            className="music-section"
            aria-labelledby="list-title"
            aria-busy={showResults && search.loading}
          >
            <div className="section-heading list-heading">
              <div>
                <span className="eyebrow muted-eyebrow">{listEyebrow}</span>
                <h1 id="list-title" className="list-title">
                  {listTitle}
                </h1>
                {!isHome && (
                  <p className="result-caption" role="status">
                    {resultCaption}
                  </p>
                )}
              </div>
              {(showResults || section === 'favorites') && orderedTracks.length > 0 ? (
                <label className="sort-control">
                  <span>Сортировка</span>
                  <select
                    aria-label="Сортировка композиций"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortOrder)}
                  >
                    <option value="relevance">
                      {section === 'favorites' ? 'По добавлению' : 'По релевантности'}
                    </option>
                    <option value="title">По названию</option>
                  </select>
                  <ArrowDown size={14} aria-hidden="true" />
                </label>
              ) : (
                isHome && (
                  <button
                    className="text-button"
                    onClick={() => changeQuery(musicSource === 'audius' ? 'electronic' : 'summer')}
                  >
                    Больше музыки
                    <ArrowRight size={16} />
                  </button>
                )
              )}
            </div>
            {showResults && search.error && (
              <ErrorNotice message={search.error} onRetry={search.retry} />
            )}
            {section === 'favorites' ? (
              <Favorites
                tracks={displayedTracks}
                {...listProps}
                onSearch={() => setSection('search')}
              />
            ) : (showResults && search.loading && orderedTracks.length === 0) ||
              (isHome && discoverLoading && orderedTracks.length === 0) ? (
              <TrackSkeleton />
            ) : orderedTracks.length > 0 ? (
              <TrackList tracks={displayedTracks} {...listProps} />
            ) : showResults && !search.loading && !search.error ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Search size={31} />
                </span>
                <h2>Пока ничего не найдено</h2>
                <p>
                  Попробуйте другое название песни,
                  <br />
                  имя исполнителя или альбом.
                </p>
                <button className="secondary-button" onClick={() => changeQuery('')}>
                  Вернуться к подборке
                </button>
              </div>
            ) : null}
            {orderedTracks.length > visibleCount && (
              <button
                className="load-more secondary-button"
                onClick={() => setVisibleCount((count) => count + 20)}
              >
                Показать ещё
                <ArrowDown size={16} />
              </button>
            )}
          </section>
          <MusicCredits source={musicSource} showBothSources={section === 'favorites'} />
        </main>
      </div>
      <Player player={player} isFavorite={library.isFavorite} onFavorite={toggleFavorite} />
      <div className={`toast ${toast ? 'toast-visible' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <Check size={17} />
            <span>{toast}</span>
            <button
              className="icon-button"
              onClick={() => setToast('')}
              aria-label="Закрыть уведомление"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function initialSource(): MusicSource {
  try {
    return localStorage.getItem('melodia:source:v2') === 'audius' ? 'audius' : 'itunes';
  } catch {
    return 'itunes';
  }
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice error-notice" role="alert">
      <WifiOff size={18} />
      <span>{message}</span>
      <button onClick={onRetry}>Повторить</button>
    </div>
  );
}

function trackWord(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return 'композиций';
  if (count % 10 === 1) return 'композиция';
  if (count % 10 >= 2 && count % 10 <= 4) return 'композиции';
  return 'композиций';
}
