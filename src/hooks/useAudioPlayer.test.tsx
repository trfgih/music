import { act, cleanup, fireEvent, render, renderHook, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../types';
import { useAudioPlayer } from './useAudioPlayer';
import { Player } from '../components/Player';

const first: Track = {
  id: '1',
  title: 'Первая',
  artist: 'Исполнитель',
  album: 'Альбом',
  durationMs: 180_000,
  audioUrl: 'https://example.test/first.mp3',
  sourceUrl: 'https://music.apple.com/us/album/first/1',
  source: 'itunes',
  playbackType: 'preview',
};
const unavailable: Track = {
  id: '2',
  title: 'Без фрагмента',
  artist: 'Исполнитель',
  album: 'Альбом',
};
const last: Track = {
  id: '3',
  title: 'Последняя',
  artist: 'Исполнитель',
  album: 'Альбом',
  audioUrl: 'https://example.test/last.mp3',
};
const fullTrack: Track = {
  id: 'audius:full',
  title: 'Полная композиция',
  artist: 'Независимый исполнитель',
  album: 'Новый альбом',
  durationMs: 210_000,
  audioUrl: 'https://example.test/full-stream.mp3',
  sourceUrl: 'https://audius.co/artist/full-track',
  source: 'audius',
  playbackType: 'full',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  copyright: '© Независимый исполнитель',
};

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  preload = '';
  src = '';
  currentSrc = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  ended = false;
  volume = 1;
  muted = false;
  error: MediaError | null = null;
  constructor() {
    super();
    MockAudio.instances.push(this);
  }
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  load = vi.fn(() => {
    this.currentSrc = this.src;
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.ended = false;
    this.error = null;
  });
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

beforeEach(() => {
  MockAudio.instances = [];
  vi.stubGlobal('Audio', MockAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAudioPlayer', () => {
  it('waits for a user action and reads fragment duration and progress from media events', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    expect(MockAudio.instances).toHaveLength(1);
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => result.current.select(first, [first]));
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.duration).toBe(0);
    act(() => {
      audio.duration = 30;
      audio.dispatchEvent(new Event('loadedmetadata'));
      audio.currentTime = 9;
      audio.dispatchEvent(new Event('timeupdate'));
    });
    expect(result.current.duration).toBe(30);
    expect(result.current.currentTime).toBe(9);
    act(() => result.current.seek(50));
    expect(audio.currentTime).toBe(30);
    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(false);
    await act(async () => result.current.toggle());
    expect(result.current.isPlaying).toBe(true);
  });

  it('plays a full track past ninety seconds using actual metadata and retains it on a provider queue change', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    await act(async () => result.current.select(fullTrack, [fullTrack]));
    act(() => {
      audio.duration = 241.5;
      audio.dispatchEvent(new Event('loadedmetadata'));
      result.current.seek(90);
    });
    expect(result.current.duration).toBe(241.5);
    expect(audio.currentTime).toBe(90);
    expect(result.current.currentTime).toBe(90);
    act(() => result.current.updateQueue([first, last]));
    expect(result.current.selected?.id).toBe(fullTrack.id);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTime).toBe(90);
    expect(audio.src).toBe(fullTrack.audioUrl);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(result.current.canPrevious).toBe(false);
    expect(result.current.canNext).toBe(false);
  });

  it('uses one audio element, skips unavailable audio and stops at queue edges', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    const queue = [first, unavailable, last];
    await act(async () => result.current.select(first, queue));
    expect(result.current.canPrevious).toBe(false);
    expect(result.current.canNext).toBe(true);
    await act(async () => result.current.next());
    expect(result.current.selected?.id).toBe(last.id);
    expect(audio.src).toBe(last.audioUrl);
    expect(result.current.canNext).toBe(false);
    await act(async () => result.current.next());
    expect(result.current.selected?.id).toBe(last.id);
    await act(async () => result.current.previous());
    expect(result.current.selected?.id).toBe(first.id);
    expect(MockAudio.instances).toHaveLength(1);
  });

  it('follows a reordered current list without changing the selected track or playback', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    const stableUpdateQueue = result.current.updateQueue;
    await act(async () => result.current.select(first, [first, unavailable, last]));
    act(() => result.current.updateQueue([last, first, unavailable]));
    expect(result.current.selected?.id).toBe(first.id);
    expect(result.current.isPlaying).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(result.current.canPrevious).toBe(true);
    expect(result.current.canNext).toBe(false);
    expect(result.current.updateQueue).toBe(stableUpdateQueue);
    const previousRender = result.current;
    act(() => result.current.updateQueue([last, first, unavailable]));
    expect(result.current).toBe(previousRender);
    await act(async () => result.current.previous());
    expect(result.current.selected?.id).toBe(last.id);
    act(() => result.current.updateQueue([unavailable]));
    expect(result.current.selected?.id).toBe(last.id);
    expect(result.current.canPrevious).toBe(false);
    expect(result.current.canNext).toBe(false);
  });

  it('ignores a rejected play promise from a track switched away from', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    let rejectOldPlay!: (reason: Error) => void;
    audio.play.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectOldPlay = reject;
        }),
    );
    act(() => result.current.select(first, [first, last]));
    expect(result.current.isLoading).toBe(true);
    await act(async () => result.current.select(last, [first, last]));
    await act(async () => rejectOldPlay(new Error('Old source cancelled')));
    expect(result.current.selected?.id).toBe(last.id);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('cancels a pending playback request when the user presses pause', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    let finishPlay!: () => void;
    audio.play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPlay = resolve;
        }),
    );
    act(() => result.current.select(first, [first]));
    act(() => result.current.toggle());
    await act(async () => finishPlay());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('resumes on the first user click after a browser or device pauses playback', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    await act(async () => result.current.select(first, [first]));
    act(() => audio.pause());
    expect(result.current.isPlaying).toBe(false);
    await act(async () => result.current.toggle());
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(result.current.isPlaying).toBe(true);
  });

  it('ignores a pending play rejection after a native external pause', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    let rejectPlay!: (reason: Error) => void;
    audio.play.mockImplementationOnce(() => {
      audio.paused = false;
      return new Promise<void>((_, reject) => {
        rejectPlay = reject;
      });
    });
    act(() => result.current.select(first, [first]));
    act(() => audio.pause());
    await act(async () => rejectPlay(new Error('Paused by the system')));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    await act(async () => result.current.toggle());
    expect(result.current.isPlaying).toBe(true);
  });

  it('handles the end, unavailable audio and a media error without autoplaying another track', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    await act(async () => result.current.select(first, [first, last]));
    act(() => {
      audio.ended = true;
      audio.paused = true;
      audio.dispatchEvent(new Event('ended'));
    });
    expect(result.current.selected?.id).toBe(first.id);
    expect(result.current.isPlaying).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    act(() => result.current.select(unavailable, [unavailable]));
    expect(result.current.error).toContain('нет доступного');
    expect(result.current.isLoading).toBe(false);
    expect(audio.src).toBe('');
    await act(async () => result.current.select(last, [last]));
    act(() => {
      audio.error = { code: 2 } as MediaError;
      audio.dispatchEvent(new Event('error'));
    });
    expect(result.current.error).toContain('Не удалось воспроизвести');
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('uses a source-provided reason when audio is unavailable', () => {
    const { result } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    const blockedTrack: Track = {
      ...fullTrack,
      audioUrl: undefined,
      unavailableReason: 'Автор ограничил доступ к композиции.',
    };
    act(() => result.current.select(blockedTrack, [blockedTrack]));
    expect(result.current.error).toBe(blockedTrack.unavailableReason);
    expect(result.current.isPlaying).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('updates volume and mute and releases the audio source on unmount', () => {
    const { result, unmount } = renderHook(() => useAudioPlayer());
    const audio = MockAudio.instances[0];
    act(() => result.current.setVolume(0.4));
    expect(audio.volume).toBe(0.4);
    act(() => result.current.toggleMute());
    expect(audio.muted).toBe(true);
    expect(result.current.muted).toBe(true);
    unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('');
    expect(audio.load).toHaveBeenCalled();
  });
});

describe('Player source labels', () => {
  it('distinguishes full Audius tracks from iTunes fragments and keeps new source links inside the focus trap', async () => {
    const { result } = renderHook(() => useAudioPlayer());
    await act(async () => result.current.select(fullTrack, [fullTrack]));
    act(() => result.current.toggle());
    const favoriteProps = { isFavorite: () => false, onFavorite: vi.fn() };
    const view = render(<Player player={result.current} {...favoriteProps} />);
    expect(view.getByText('Полная композиция · Audius')).toBeTruthy();
    expect(view.getByText(`${fullTrack.artist} · полный трек`)).toBeTruthy();
    expect(view.getAllByRole('button', { name: `Слушать: ${fullTrack.title}` })).toHaveLength(2);
    expect(view.queryByAltText('Доступно в iTunes Store')).toBeNull();
    expect(
      view.getByRole('link', { name: `Открыть ${fullTrack.title} в Audius` }).getAttribute('href'),
    ).toBe(fullTrack.sourceUrl);
    const opener = view.getByRole('button', { name: 'Открыть подробный плеер' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = view.getByRole('dialog');
    expect(within(dialog).getByText('Источник: Audius')).toBeTruthy();
    const licenceLink = within(dialog).getByRole('link', { name: 'Лицензия композиции' });
    expect(licenceLink.getAttribute('href')).toBe(fullTrack.licenseUrl);
    licenceLink.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Закрыть плеер' }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => result.current.select(first, [first]));
    act(() => result.current.toggle());
    view.rerender(<Player player={result.current} {...favoriteProps} />);
    expect(view.getByText('Фрагмент предоставлен iTunes')).toBeTruthy();
    expect(view.getAllByRole('button', { name: `Слушать фрагмент: ${first.title}` })).toHaveLength(
      2,
    );
    expect(view.getByAltText('Доступно в iTunes Store')).toBeTruthy();
    expect(view.queryByText('Полная композиция · Audius')).toBeNull();
    expect(view.queryByRole('link', { name: /в Audius/ })).toBeNull();
  });
});
