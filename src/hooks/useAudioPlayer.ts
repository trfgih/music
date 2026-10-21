import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../types';

const playbackError =
  'Не удалось воспроизвести композицию. Попробуйте ещё раз или выберите другой трек.';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const requestRef = useRef(0);
  const wantsPlaybackRef = useRef(false);
  const mountedRef = useRef(false);
  const volumeRef = useRef(0.8);
  const mutedRef = useRef(false);
  const [selected, setSelected] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, updateVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    try {
      audio.volume = volumeRef.current;
    } catch {
      // На некоторых телефонах громкость меняется только кнопками устройства.
    }
    audio.muted = mutedRef.current;
    audioRef.current = audio;
    mountedRef.current = true;

    // При смене трека браузер ещё может прислать события от предыдущего файла.
    const isCurrentSource = () =>
      Boolean(selectedRef.current?.audioUrl) &&
      (!audio.currentSrc || audio.currentSrc === audio.src);
    const readDuration = () => {
      if (isCurrentSource())
        setDuration(Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0);
    };
    const onTimeUpdate = () => {
      if (isCurrentSource())
        setCurrentTime(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
    };
    const onPlay = () => {
      if (isCurrentSource() && wantsPlaybackRef.current) setIsPlaying(true);
    };
    const onPlaying = () => {
      if (isCurrentSource() && wantsPlaybackRef.current) {
        setIsPlaying(true);
        setIsLoading(false);
        setError(null);
      }
    };
    const onPause = () => {
      // Запоздалое событие pause не должно остановить уже запущенный новый трек.
      if (!audio.paused) return;
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
    };
    const onWaiting = () => {
      if (isCurrentSource() && wantsPlaybackRef.current) setIsLoading(true);
    };
    const onCanPlay = () => {
      if (isCurrentSource()) setIsLoading(false);
    };
    const onEnded = () => {
      if (!isCurrentSource()) return;
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
      onTimeUpdate();
    };
    const onError = () => {
      if (!isCurrentSource()) return;
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
      setError(playbackError);
    };
    const onVolumeChange = () => {
      volumeRef.current = audio.volume;
      mutedRef.current = audio.muted;
      updateVolume(audio.volume);
      setMuted(audio.muted);
    };
    const listeners: [string, EventListener][] = [
      ['loadedmetadata', readDuration],
      ['durationchange', readDuration],
      ['timeupdate', onTimeUpdate],
      ['seeking', onTimeUpdate],
      ['play', onPlay],
      ['playing', onPlaying],
      ['pause', onPause],
      ['waiting', onWaiting],
      ['canplay', onCanPlay],
      ['ended', onEnded],
      ['error', onError],
      ['volumechange', onVolumeChange],
    ];
    listeners.forEach(([name, listener]) => audio.addEventListener(name, listener));
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      listeners.forEach(([name, listener]) => audio.removeEventListener(name, listener));
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !selectedRef.current?.audioUrl) return;
    const request = ++requestRef.current;
    wantsPlaybackRef.current = true;
    setError(null);
    setIsLoading(true);
    // Вызываем play() из обработчика нажатия, иначе браузер может запретить запуск.
    try {
      void audio
        .play()
        .then(() => {
          if (!mountedRef.current || request !== requestRef.current) return;
          setIsPlaying(!audio.paused);
          setIsLoading(false);
        })
        .catch(() => {
          if (!mountedRef.current || request !== requestRef.current) return;
          wantsPlaybackRef.current = false;
          setIsPlaying(false);
          setIsLoading(false);
          setError(playbackError);
        });
    } catch {
      wantsPlaybackRef.current = false;
      setIsLoading(false);
      setIsPlaying(false);
      setError(playbackError);
    }
  }, []);

  const select = useCallback(
    (track: Track, tracks: Track[]) => {
      const audio = audioRef.current;
      queueRef.current = tracks;
      setQueue(tracks);
      if (!audio) return;
      if (
        selectedRef.current?.id === track.id &&
        selectedRef.current.audioUrl === track.audioUrl &&
        audio.src &&
        !audio.error
      ) {
        if (audio.ended) audio.currentTime = 0;
        play();
        return;
      }
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      audio.pause();
      selectedRef.current = track;
      setSelected(track);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      if (!track.audioUrl) {
        audio.removeAttribute('src');
        audio.load();
        setIsLoading(false);
        setError(track.unavailableReason ?? 'У этой композиции нет доступного аудио.');
        return;
      }
      setIsLoading(true);
      audio.src = track.audioUrl;
      audio.load();
      play();
    },
    [play],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !selectedRef.current?.audioUrl) return;
    if (wantsPlaybackRef.current || !audio.paused) {
      requestRef.current += 1;
      wantsPlaybackRef.current = false;
      audio.pause();
      setIsPlaying(false);
      setIsLoading(false);
    } else {
      if (audio.error) audio.load();
      if (audio.ended) audio.currentTime = 0;
      play();
    }
  }, [play]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (
      !audio ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      !Number.isFinite(seconds)
    )
      return;
    try {
      audio.currentTime = Math.min(audio.duration, Math.max(0, seconds));
      setCurrentTime(audio.currentTime);
    } catch {
      // До загрузки метаданных браузер может не разрешать перемотку.
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const nextVolume = Math.min(1, Math.max(0, value));
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.volume = nextVolume;
      } catch {
        // В этом браузере остаётся системная регулировка громкости.
      }
    }
    const actualVolume = audio ? audio.volume : nextVolume;
    volumeRef.current = actualVolume;
    updateVolume(actualVolume);
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (audioRef.current) audioRef.current.muted = nextMuted;
  }, []);

  const updateQueue = useCallback((tracks: Track[]) => {
    const currentQueue = queueRef.current;
    if (
      currentQueue.length === tracks.length &&
      currentQueue.every((track, index) => track.id === tracks[index].id)
    )
      return;
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

  const move = useCallback(
    (direction: -1 | 1) => {
      const tracks = queueRef.current;
      const index = tracks.findIndex((track) => track.id === selectedRef.current?.id);
      if (index < 0) return;
      for (
        let nextIndex = index + direction;
        nextIndex >= 0 && nextIndex < tracks.length;
        nextIndex += direction
      ) {
        const track = tracks[nextIndex];
        if (track.audioUrl) {
          select(track, tracks);
          return;
        }
      }
    },
    [select],
  );

  const selectedIndex = queue.findIndex((track) => track.id === selected?.id);
  return {
    selected,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    muted,
    error,
    select,
    toggle,
    seek,
    setVolume,
    toggleMute,
    updateQueue,
    previous: useCallback(() => move(-1), [move]),
    next: useCallback(() => move(1), [move]),
    canPrevious:
      selectedIndex >= 0 && queue.slice(0, selectedIndex).some((track) => Boolean(track.audioUrl)),
    canNext:
      selectedIndex >= 0 && queue.slice(selectedIndex + 1).some((track) => Boolean(track.audioUrl)),
  };
}
