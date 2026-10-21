import type { Track } from './types';

export function isFullTrack(track: Track | null | undefined): boolean {
  return (
    track?.playbackType === 'full' ||
    track?.source === 'audius' ||
    Boolean(track?.id.startsWith('audius:'))
  );
}

export function trackSourceName(track: Track): string {
  return track.source === 'audius' || track.id.startsWith('audius:') ? 'Audius' : 'iTunes';
}

export function playActionLabel(track: Track, isPlaying: boolean): string {
  if (!track.audioUrl)
    return `${track.unavailableReason ?? 'Прослушивание недоступно'}: ${track.title}`;
  if (isPlaying) return `Пауза: ${track.title}`;
  return `${isFullTrack(track) ? 'Слушать' : 'Слушать фрагмент'}: ${track.title}`;
}
