import { ArrowUpRight, Heart, Headphones, LoaderCircle, Pause, Play } from 'lucide-react';
import type { MusicSource, Track } from '../types';
import { Artwork } from './Artwork';
import { playActionLabel, trackSourceName } from '../playback';

interface Props {
  tracks: Track[];
  source: MusicSource;
  isFavorite: (id: string) => boolean;
  onFavorite: (track: Track) => void;
  onPlay: (track: Track) => void;
  onStart: (track: Track) => void;
  onQuery: (query: string) => void;
  selectedId?: string;
  isPlaying: boolean;
  isLoading: boolean;
}

const moods = [
  { label: 'Инди и альтернатива', query: 'indie alternative', color: 'sage' },
  { label: 'Электронный пульс', query: 'Daft Punk', color: 'lilac' },
  { label: 'Тихий вечер', query: 'Norah Jones', color: 'sand' },
  { label: 'Русская музыка', query: 'Земфира', color: 'rose' },
];

const audiusMoods = [
  { label: 'Электронный пульс', query: 'electronic', color: 'sage' },
  { label: 'Спокойный фокус', query: 'lofi', color: 'lilac' },
  { label: 'Хип-хоп и ритм', query: 'hip hop', color: 'sand' },
  { label: 'Тихий вечер', query: 'chill', color: 'rose' },
];

export function Discover({
  tracks,
  source,
  isFavorite,
  onFavorite,
  onPlay,
  onStart,
  onQuery,
  selectedId,
  isPlaying,
  isLoading,
}: Props) {
  const unique = tracks
    .filter(
      (track, index, all) =>
        all.findIndex((item) => item.artworkUrl === track.artworkUrl) === index,
    )
    .slice(0, 6);
  return (
    <>
      <section className="discovery-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> ВАШЕ НАСТРОЕНИЕ. ВАША МУЗЫКА.
          </span>
          <h1 id="hero-title">
            Найдите своё
            <br />
            <span>звучание.</span>
          </h1>
          <p>
            Любимые треки и новые открытия.
            <br />
            Всё начинается с одной мелодии.
          </p>
          <button
            className="primary-button"
            onClick={() => onQuery(source === 'audius' ? 'chill' : 'The Weeknd')}
          >
            <Headphones size={18} />
            Открыть новую музыку
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="hero-star">✳</span>
          <div className="vinyl">
            <div className="vinyl-center" />
          </div>
          {unique.slice(0, 3).map((track, i) => (
            <Artwork
              key={track.id}
              url={track.artworkUrl}
              title=""
              className={`hero-cover hero-cover-${i}`}
            />
          ))}
          <span className="hero-sticker">
            <Headphones size={17} /> ВКЛЮЧИТЕ НАСТРОЕНИЕ
          </span>
        </div>
      </section>
      <section className="moods-section" aria-labelledby="moods-title">
        <div className="section-heading compact">
          <h2 id="moods-title">Что у вас на душе?</h2>
          <span>Выберите настроение</span>
        </div>
        <div className="mood-grid">
          {(source === 'audius' ? audiusMoods : moods).map((mood) => (
            <button
              className={`mood-card ${mood.color}`}
              key={mood.label}
              onClick={() => onQuery(mood.query)}
            >
              <span>{mood.label}</span>
              <ArrowUpRight size={19} />
            </button>
          ))}
        </div>
      </section>
      <section className="album-section" aria-labelledby="discover-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow muted-eyebrow">
              {source === 'audius' ? 'ПОПУЛЯРНО В AUDIUS' : 'ВЫБРАНО ДЛЯ ВАС'}
            </span>
            <h2 id="discover-title">На волне хорошего дня</h2>
          </div>
          <span className="section-description">Мелодии, к которым хочется вернуться</span>
        </div>
        <div className="album-grid">
          {unique.map((track) => (
            <article
              className={`album-card ${track.audioUrl ? 'playable' : ''}`}
              key={track.id}
              onClick={(event) => {
                if (!track.audioUrl) return;
                if (
                  event.target instanceof Element &&
                  event.target.closest('button, a, input, select')
                )
                  return;
                onStart(track);
              }}
            >
              <div className="album-cover-wrap">
                <button
                  className="album-play"
                  onClick={() => onPlay(track)}
                  disabled={!track.audioUrl}
                  aria-label={playActionLabel(track, selectedId === track.id && isPlaying)}
                >
                  <Artwork url={track.artworkUrl} title={`Обложка: ${track.album}`} />
                  <span className={`album-play-icon ${selectedId === track.id ? 'visible' : ''}`}>
                    {selectedId === track.id && isLoading ? (
                      <LoaderCircle size={22} className="spinning" />
                    ) : selectedId === track.id && isPlaying ? (
                      <Pause size={22} fill="currentColor" />
                    ) : (
                      <Play size={22} fill="currentColor" />
                    )}
                  </span>
                </button>
                <button
                  className={`album-favorite ${isFavorite(track.id) ? 'liked' : ''}`}
                  onClick={() => onFavorite(track)}
                  title={isFavorite(track.id) ? 'Убрать из избранного' : 'Добавить в избранное'}
                  aria-label={`${isFavorite(track.id) ? 'Убрать из избранного' : 'Добавить в избранное'}: ${track.title}`}
                  aria-pressed={isFavorite(track.id)}
                >
                  <Heart size={17} fill={isFavorite(track.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <h3 title={track.title}>
                <button
                  type="button"
                  className="album-title-button"
                  disabled={!track.audioUrl}
                  onClick={() => onStart(track)}
                  aria-label={
                    track.audioUrl
                      ? `Воспроизвести: ${track.title}`
                      : `${track.unavailableReason ?? 'Прослушивание недоступно'}: ${track.title}`
                  }
                >
                  {track.title}
                </button>
              </h3>
              <p title={track.artist}>{track.artist}</p>
              {track.sourceUrl && (
                <a className="album-store" href={track.sourceUrl} target="_blank" rel="noreferrer">
                  Открыть в {trackSourceName(track)} <ArrowUpRight size={12} />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
