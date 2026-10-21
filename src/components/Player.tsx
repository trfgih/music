import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronUp,
  ExternalLink,
  Heart,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Track } from '../types';
import { formatTime } from '../utils';
import { isFullTrack, playActionLabel, trackSourceName } from '../playback';
import type { useAudioPlayer } from '../hooks/useAudioPlayer';
import './player.css';

type AudioPlayer = ReturnType<typeof useAudioPlayer>;
interface PlayerProps {
  player: AudioPlayer;
  isFavorite: (id: string) => boolean;
  onFavorite: (track: Track) => void;
}

function Artwork({ track, className = '' }: { track: Track | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  return (
    <span className={`player-artwork ${className}`} key={track?.id}>
      {track?.artworkUrl && failedUrl !== track.artworkUrl ? (
        <img src={track.artworkUrl} alt="" onError={() => setFailedUrl(track.artworkUrl)} />
      ) : (
        <Music2 size={24} aria-hidden="true" />
      )}
    </span>
  );
}

function playbackButtonLabel(player: AudioPlayer): string {
  if (!player.selected) return 'Выберите композицию для прослушивания';
  if (player.isLoading && !player.isPlaying) return `Отменить загрузку: ${player.selected.title}`;
  return playActionLabel(player.selected, player.isPlaying);
}

function PlayButton({ player }: { player: AudioPlayer }) {
  const label = playbackButtonLabel(player);
  let icon = <Play size={20} fill="currentColor" aria-hidden="true" />;
  if (player.isPlaying) {
    icon = <Pause size={20} fill="currentColor" aria-hidden="true" />;
  } else if (player.isLoading) {
    icon = <LoaderCircle className="player-spinner" size={21} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      className="player-play-button"
      onClick={player.toggle}
      disabled={!player.selected?.audioUrl}
      aria-label={label}
      title={label}
      aria-pressed={player.isPlaying || player.isLoading}
    >
      {icon}
    </button>
  );
}

function playbackDescription(player: AudioPlayer): string {
  const track = player.selected;
  if (!track) return 'Выберите музыку для прослушивания';
  if (!track.audioUrl) return track.unavailableReason ?? 'Прослушивание недоступно';

  const source = trackSourceName(track);
  if (player.isLoading) {
    const subject = isFullTrack(track) ? 'композиции' : 'фрагмента';
    return `Загрузка ${subject}… · ${source}`;
  }
  if (isFullTrack(track)) return `Полная композиция · ${source}`;
  return `Фрагмент предоставлен ${source}`;
}

function Transport({ player }: { player: AudioPlayer }) {
  return (
    <div className="player-transport">
      <button
        type="button"
        className="player-icon-button"
        onClick={player.previous}
        disabled={!player.canPrevious}
        aria-label="Предыдущая композиция"
        title="Предыдущая композиция"
      >
        <SkipBack size={19} aria-hidden="true" />
      </button>
      <PlayButton player={player} />
      <button
        type="button"
        className="player-icon-button"
        onClick={player.next}
        disabled={!player.canNext}
        aria-label="Следующая композиция"
        title="Следующая композиция"
      >
        <SkipForward size={19} aria-hidden="true" />
      </button>
    </div>
  );
}

function Timeline({ player }: { player: AudioPlayer }) {
  const duration = player.duration;
  const position = Math.min(duration || 0, player.currentTime);
  const rangeStyle = {
    '--range-fill': `${duration > 0 ? (position / duration) * 100 : 0}%`,
  } as CSSProperties;
  return (
    <div className="player-timeline">
      <span className="player-time">{formatTime(player.currentTime)}</span>
      <input
        type="range"
        className="player-range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={position}
        onChange={(event) => player.seek(Number(event.target.value))}
        disabled={duration <= 0 || !player.selected?.audioUrl}
        style={rangeStyle}
        aria-label="Позиция воспроизведения"
        aria-valuetext={`${formatTime(position)} из ${formatTime(duration > 0 ? duration : undefined)}`}
      />
      <span className="player-time">{formatTime(duration > 0 ? duration : undefined)}</span>
    </div>
  );
}

function FavoriteButton({
  track,
  isFavorite,
  onFavorite,
}: Pick<PlayerProps, 'isFavorite' | 'onFavorite'> & { track: Track | null }) {
  const favorite = track ? isFavorite(track.id) : false;
  const label = favorite ? 'Удалить из избранного' : 'Добавить в избранное';
  return (
    <button
      type="button"
      className={`player-icon-button player-favorite ${favorite ? 'is-favorite' : ''}`}
      disabled={!track}
      onClick={() => track && onFavorite(track)}
      aria-label={label}
      title={label}
      aria-pressed={favorite}
    >
      <Heart size={19} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

export function Player({ player, isFavorite, onFavorite }: PlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const track = player.selected;
  const favoriteProps = { track, isFavorite, onFavorite };
  const playbackLabel = playbackDescription(player);
  const volumeStyle = {
    '--range-fill': `${(player.muted ? 0 : player.volume) * 100}%`,
  } as CSSProperties;

  useEffect(() => {
    if (!expanded) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key !== 'Tab') return;
      const elements = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
        ) ?? []),
      ];
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [expanded]);

  return (
    <>
      <footer className="player" aria-label="Музыкальный плеер">
        <div className="player-desktop">
          <div className="player-track">
            <Artwork track={track} />
            <div className="player-track-text" key={track?.id}>
              <strong title={track?.title}>{track?.title ?? 'Сейчас в Melodia'}</strong>
              <span title={track?.artist}>{track?.artist ?? 'Ваша музыка — рядом'}</span>
              <small title={playbackLabel}>{playbackLabel}</small>
            </div>
            <FavoriteButton {...favoriteProps} />
          </div>
          <div className="player-center">
            <Transport player={player} />
            <Timeline player={player} />
          </div>
          <div className="player-right">
            <SourceLink track={track} />
            <div className="player-volume">
              <button
                type="button"
                className="player-icon-button"
                onClick={player.toggleMute}
                aria-label={player.muted ? 'Включить звук' : 'Отключить звук'}
                title={player.muted ? 'Включить звук' : 'Отключить звук'}
                aria-pressed={player.muted}
              >
                {player.muted || player.volume === 0 ? (
                  <VolumeX size={20} aria-hidden="true" />
                ) : (
                  <Volume2 size={20} aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                className="player-range"
                min={0}
                max={1}
                step={0.01}
                value={player.volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
                style={volumeStyle}
                aria-label="Громкость"
                aria-valuetext={`${Math.round(player.volume * 100)} процентов${player.muted ? ', звук отключён' : ''}`}
              />
            </div>
          </div>
        </div>
        <div className="player-compact">
          <button
            type="button"
            className="player-expand"
            onClick={() => setExpanded(true)}
            aria-haspopup="dialog"
            aria-expanded={expanded}
            aria-label="Открыть подробный плеер"
          >
            <Artwork track={track} />
            <span className="player-track-text">
              <strong>{track?.title ?? 'Выберите композицию'}</strong>
              <span title={track?.unavailableReason}>
                {track
                  ? `${track.artist} · ${!track.audioUrl ? 'недоступно' : isFullTrack(track) ? 'полный трек' : 'фрагмент'}`
                  : 'Откройте свою музыку'}
              </span>
            </span>
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <PlayButton player={player} />
        </div>
        {player.error && (
          <div className="player-error" role="alert">
            {player.error}
          </div>
        )}
      </footer>
      {expanded && (
        <div
          className="player-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div
            className="player-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-dialog-title"
            tabIndex={-1}
          >
            <div className="player-dialog-heading">
              <span id="player-dialog-title">Сейчас играет</span>
              <button
                type="button"
                className="player-icon-button"
                ref={closeRef}
                onClick={() => setExpanded(false)}
                aria-label="Закрыть плеер"
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>
            <Artwork track={track} className="player-dialog-artwork" />
            <div className="player-dialog-track">
              <div className="player-track-text" key={track?.id}>
                <strong>{track?.title ?? 'Выберите композицию'}</strong>
                <span>{track?.artist ?? 'Музыка начнётся с вашего выбора'}</span>
                {track && <span className="player-dialog-album">{track.album}</span>}
              </div>
              <FavoriteButton {...favoriteProps} />
            </div>
            <div className="player-playback-label">{playbackLabel}</div>
            <Timeline player={player} />
            <Transport player={player} />
            <SourceLink track={track} />
            {track && (
              <div className="player-source-details">
                <span>Источник: {trackSourceName(track)}</span>
                {track.copyright && <span>{track.copyright}</span>}
                {track.licenseUrl && (
                  <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer">
                    Лицензия композиции <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
            {player.error && (
              <p className="player-dialog-error" role="status">
                {player.error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SourceLink({ track }: { track: Track | null }) {
  if (!track?.sourceUrl) return null;
  const sourceName = trackSourceName(track);
  if (sourceName === 'Audius')
    return (
      <a
        className="player-source-link"
        href={track.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Открыть ${track.title} в Audius`}
      >
        <span>Открыть в Audius</span>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    );
  return (
    <a
      className="player-store-badge"
      href={track.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Открыть ${track.title} в iTunes Store`}
    >
      <img src="/itunes-badge.svg" alt="Доступно в iTunes Store" />
    </a>
  );
}
