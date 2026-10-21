import { ExternalLink, Heart, LoaderCircle, Pause, Play } from 'lucide-react';
import { useState } from 'react';
import type { Track } from '../types';
import { formatTime } from '../utils';
import { Artwork } from './Artwork';
import { playActionLabel, trackSourceName } from '../playback';

export interface TrackListProps {
  tracks: Track[];
  selectedId?: string;
  isPlaying: boolean;
  isLoading: boolean;
  isFavorite: (id: string) => boolean;
  onFavorite: (track: Track) => void;
  onPlay: (track: Track) => void;
  onStart: (track: Track) => void;
  favoritesSection?: boolean;
}

export function TrackList(props: TrackListProps) {
  return (
    <div className="track-list">
      <div className="track-table-header" aria-hidden="true">
        <span>#</span>
        <span>КОМПОЗИЦИЯ</span>
        <span>АЛЬБОМ</span>
        <span>ВРЕМЯ</span>
        <span />
      </div>
      <ol aria-label={props.favoritesSection ? 'Избранные композиции' : 'Композиции'}>
        {props.tracks.map((track, index) => (
          <TrackRow key={track.id} {...props} track={track} index={index} />
        ))}
      </ol>
    </div>
  );
}

function TrackRow({
  track,
  index,
  selectedId,
  isPlaying,
  isLoading,
  isFavorite,
  onFavorite,
  onPlay,
  onStart,
  favoritesSection,
}: TrackListProps & { track: Track; index: number }) {
  const active = selectedId === track.id;
  const liked = isFavorite(track.id);
  const [removing, setRemoving] = useState(false);
  function favorite() {
    if (favoritesSection && liked) setRemoving(true);
    else onFavorite(track);
  }
  return (
    <li
      className={`track-row ${track.audioUrl ? 'playable' : ''} ${active ? 'selected' : ''} ${removing ? 'removing' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
      onClick={(event) => {
        if (!track.audioUrl || removing) return;
        // Кнопки и ссылки обрабатывают нажатие сами, без повторного запуска строки.
        if (event.target instanceof Element && event.target.closest('button, a, input, select'))
          return;
        onStart(track);
      }}
      onAnimationEnd={(event) => {
        if (event.animationName === 'row-out' && removing) onFavorite(track);
      }}
    >
      <div className="track-number">
        {active && isPlaying ? (
          <span className="equalizer" aria-label="Играет">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span>{String(index + 1).padStart(2, '0')}</span>
        )}
      </div>
      <div className="track-identity">
        <button
          className="cover-play"
          disabled={!track.audioUrl}
          onClick={() => onPlay(track)}
          title={playActionLabel(track, active && isPlaying)}
          aria-label={playActionLabel(track, active && isPlaying)}
        >
          <Artwork url={track.artworkUrl} title={`Обложка: ${track.album}`} />
          <span className={`cover-play-overlay ${active ? 'visible' : ''}`}>
            {active && isLoading ? (
              <LoaderCircle size={18} className="spinning" />
            ) : active && isPlaying ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </span>
        </button>
        <button
          type="button"
          className="track-names"
          disabled={!track.audioUrl}
          onClick={() => onStart(track)}
          aria-label={
            track.audioUrl
              ? `Воспроизвести: ${track.title}`
              : `${track.unavailableReason ?? 'Прослушивание недоступно'}: ${track.title}`
          }
        >
          <span className="track-title" title={track.title}>
            {track.title}
          </span>
          <span className="track-artist" title={`${track.artist} · ${track.album}`}>
            {track.artist}
            <span className="track-mobile-album"> · {track.album}</span>
            {!track.audioUrl && (
              <span className="unavailable-note"> · {track.unavailableReason ?? 'нет аудио'}</span>
            )}
          </span>
        </button>
      </div>
      <span className="track-album" title={track.album}>
        {track.album}
      </span>
      <span className="track-duration">
        {formatTime(track.durationMs === undefined ? undefined : track.durationMs / 1000)}
      </span>
      <div className="track-actions">
        {track.sourceUrl && (
          <a
            className="store-link"
            href={track.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={`Открыть композицию в ${trackSourceName(track)}`}
            aria-label={`Открыть ${track.title} в ${trackSourceName(track)}`}
          >
            <ExternalLink size={14} />
            <span>{trackSourceName(track)}</span>
          </a>
        )}
        <button
          className={`favorite-button icon-button ${liked ? 'liked' : ''}`}
          onClick={favorite}
          title={liked ? 'Убрать из избранного' : 'Добавить в избранное'}
          aria-label={`${liked ? 'Убрать из избранного' : 'Добавить в избранное'}: ${track.title}`}
          aria-pressed={liked}
        >
          <Heart
            size={19}
            fill={liked ? 'currentColor' : 'none'}
            key={String(liked)}
            className={liked ? 'heart-pop' : ''}
          />
        </button>
      </div>
    </li>
  );
}

export function TrackSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="track-skeletons" aria-label="Загружаем музыку" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="track-skeleton" key={i}>
          <span className="skeleton skeleton-cover" />
          <div>
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <span className="skeleton skeleton-album" />
        </div>
      ))}
    </div>
  );
}
