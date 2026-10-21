export type MusicSource = 'audius' | 'itunes';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  durationMs?: number;
  audioUrl?: string;
  sourceUrl?: string;
  source?: MusicSource;
  playbackType?: 'full' | 'preview';
  unavailableReason?: string;
  licenseUrl?: string;
  copyright?: string;
}

export type Section = 'search' | 'favorites';
export type SortOrder = 'relevance' | 'title';

export interface MusicResult {
  tracks: Track[];
  truncated: boolean;
}
