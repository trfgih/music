import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { getDiscoverMusic, searchMusic } from './services/music';
import type { Track } from './types';

vi.mock('./services/music', () => ({ getDiscoverMusic: vi.fn(), searchMusic: vi.fn() }));

const first: Track = {
  id: 'itunes:1',
  title: 'Первая мелодия',
  artist: 'Первый исполнитель',
  album: 'Первый альбом',
  artworkUrl: 'https://example.test/first.jpg',
  audioUrl: 'https://example.test/first.m4a',
  sourceUrl: 'https://music.apple.com/us/album/first/1',
  source: 'itunes',
  playbackType: 'preview',
  durationMs: 180000,
};
const second: Track = {
  id: 'itunes:2',
  title: 'Вторая мелодия',
  artist: 'Второй исполнитель',
  album: 'Второй альбом',
  artworkUrl: 'https://example.test/second.jpg',
  audioUrl: 'https://example.test/second.m4a',
  sourceUrl: 'https://music.apple.com/us/album/second/2',
  source: 'itunes',
  playbackType: 'preview',
  durationMs: 240000,
};

class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];
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
    TestAudio.instances.push(this);
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

async function openApp() {
  const rendered = render(<App />);
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

async function finishSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

function list() {
  return screen.getByRole('list', { name: 'Композиции' });
}

function clickWithFocus(button: HTMLElement) {
  act(() => button.focus());
  fireEvent.click(button);
}

describe('сценарии приложения', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem('melodia:source:v2', 'itunes');
    TestAudio.instances = [];
    vi.stubGlobal('Audio', TestAudio);
    vi.mocked(getDiscoverMusic)
      .mockReset()
      .mockResolvedValue({ tracks: [first, second], truncated: false });
    vi.mocked(searchMusic)
      .mockReset()
      .mockResolvedValue({ tracks: [first], truncated: false });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('синхронизирует избранное в карточке и строке, восстанавливает его и удаляет после анимации', async () => {
    const initial = await openApp();
    const selection = screen.getByRole('region', { name: 'На волне хорошего дня' });
    fireEvent.click(
      within(selection).getByRole('button', { name: `Добавить в избранное: ${first.title}` }),
    );
    const synchronizedButtons = screen.getAllByRole('button', {
      name: `Убрать из избранного: ${first.title}`,
    });
    expect(synchronizedButtons).toHaveLength(2);
    expect(
      synchronizedButtons.every((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);

    initial.unmount();
    await openApp();
    expect(
      screen.getAllByRole('button', { name: `Убрать из избранного: ${first.title}` }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Избранное/ }));
    const favorites = screen.getByRole('list', { name: 'Избранные композиции' });
    const row = within(favorites).getByRole('listitem');
    fireEvent.click(
      within(row).getByRole('button', { name: `Убрать из избранного: ${first.title}` }),
    );
    expect(row.classList.contains('removing')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('melodia:favorites')!)).toHaveLength(1);

    const animation = new Event('animationend', { bubbles: true });
    Object.defineProperty(animation, 'animationName', { value: 'row-out' });
    fireEvent(row, animation);
    expect(screen.getByText('Здесь будет ваша музыка')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('melodia:favorites')!)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }));
    expect(
      screen.getAllByRole('button', { name: `Добавить в избранное: ${first.title}` }),
    ).toHaveLength(2);
  });

  it('сохраняет выбранный трек при навигации и переключает общий аудиоэлемент из списка', async () => {
    await openApp();
    const audio = TestAudio.instances[0];
    expect(audio.play).not.toHaveBeenCalled();
    fireEvent.click(
      within(list()).getByRole('button', { name: `Добавить в избранное: ${first.title}` }),
    );
    await act(async () => {
      fireEvent.click(
        within(list()).getByRole('button', { name: `Слушать фрагмент: ${first.title}` }),
      );
    });
    const player = screen.getByRole('contentinfo', { name: 'Музыкальный плеер' });
    expect(within(player).getAllByText(first.title)).toHaveLength(2);
    expect(audio.src).toBe(first.audioUrl);
    expect(
      within(screen.getByRole('region', { name: 'На волне хорошего дня' })).getByRole('button', {
        name: `Пауза: ${first.title}`,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Избранное/ }));
    const favorites = screen.getByRole('list', { name: 'Избранные композиции' });
    expect(within(favorites).getByRole('button', { name: `Пауза: ${first.title}` })).toBeTruthy();
    expect(within(player).getAllByText(first.title)).toHaveLength(2);
    expect(audio.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }));
    await act(async () => {
      fireEvent.click(
        within(list()).getByRole('button', { name: `Слушать фрагмент: ${second.title}` }),
      );
    });
    expect(within(player).getAllByText(second.title)).toHaveLength(2);
    expect(audio.src).toBe(second.audioUrl);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(TestAudio.instances).toHaveLength(1);
    expect(
      within(list()).getByRole('button', { name: `Слушать фрагмент: ${first.title}` }),
    ).toBeTruthy();
    expect(within(list()).getByRole('button', { name: `Пауза: ${second.title}` })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'На волне хорошего дня' })).getByRole('button', {
        name: `Пауза: ${second.title}`,
      }),
    ).toBeTruthy();
  });

  it('оставляет предыдущую выдачу при ошибке, повторяет запрос и позволяет повторить и очистить историю', async () => {
    const oldResult = { ...first, title: 'Старый результат' };
    const newResult = { ...second, title: 'Новый результат' };
    vi.mocked(searchMusic)
      .mockResolvedValueOnce({ tracks: [oldResult], truncated: false })
      .mockRejectedValueOnce(new Error('Сервис временно недоступен'))
      .mockResolvedValueOnce({ tracks: [newResult], truncated: false })
      .mockResolvedValueOnce({ tracks: [oldResult], truncated: false });
    await openApp();
    const input = screen.getByRole('searchbox', { name: 'Поиск музыки' });
    fireEvent.change(input, { target: { value: 'Первый запрос' } });
    await finishSearch();
    expect(within(list()).getByText(oldResult.title)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Второй запрос' } });
    await finishSearch();
    expect(screen.getByRole('alert').textContent).toContain('Сервис временно недоступен');
    expect(within(list()).getByText(oldResult.title)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('melodia:history')!)).toEqual(['Первый запрос']);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await finishSearch();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(list()).getByText(newResult.title)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Музыка по запросу «Второй запрос»' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('melodia:history')!)).toEqual([
      'Второй запрос',
      'Первый запрос',
    ]);

    clickWithFocus(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(screen.getByText('Недавно искали')).toBeTruthy();
    clickWithFocus(screen.getByRole('button', { name: 'Первый запрос' }));
    await finishSearch();
    expect((input as HTMLInputElement).value).toBe('Первый запрос');
    expect(within(list()).getByText(oldResult.title)).toBeTruthy();
    clickWithFocus(screen.getByRole('button', { name: 'Очистить поиск' }));
    clickWithFocus(screen.getByRole('button', { name: 'Очистить' }));
    expect(screen.queryByText('Недавно искали')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('melodia:history')!)).toEqual([]);
  });

  it('запускает музыку из названия, альбома, длительности и карточки, продолжая или возобновляя выбранный трек', async () => {
    await openApp();
    const audio = TestAudio.instances[0];
    const [firstRow, secondRow] = within(list()).getAllByRole('listitem');
    const titleButton = within(firstRow).getByRole('button', {
      name: `Воспроизвести: ${first.title}`,
    });
    await act(async () => {
      fireEvent.click(within(titleButton).getByText(first.title));
    });
    expect(audio.src).toBe(first.audioUrl);
    expect(audio.paused).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    const initialLoads = audio.load.mock.calls.length;
    const initialPauses = audio.pause.mock.calls.length;

    await act(async () => {
      fireEvent.click(titleButton);
    });
    expect(audio.paused).toBe(false);
    expect(audio.load).toHaveBeenCalledTimes(initialLoads);
    expect(audio.pause).toHaveBeenCalledTimes(initialPauses);
    fireEvent.click(within(firstRow).getByRole('button', { name: `Пауза: ${first.title}` }));
    expect(audio.paused).toBe(true);
    await act(async () => {
      fireEvent.click(titleButton);
    });
    expect(audio.paused).toBe(false);
    expect(audio.load).toHaveBeenCalledTimes(initialLoads);

    await act(async () => {
      fireEvent.click(within(secondRow).getByText(second.album));
    });
    expect(audio.src).toBe(second.audioUrl);
    expect(audio.paused).toBe(false);
    await act(async () => {
      fireEvent.click(within(firstRow).getByText('3:00'));
    });
    expect(audio.src).toBe(first.audioUrl);

    const discovery = screen.getByRole('region', { name: 'На волне хорошего дня' });
    await act(async () => {
      fireEvent.click(
        within(discovery).getByRole('button', {
          name: `Воспроизвести: ${second.title}`,
        }),
      );
    });
    expect(audio.src).toBe(second.audioUrl);
    await act(async () => {
      fireEvent.click(within(discovery).getByText(first.artist));
    });
    expect(audio.src).toBe(first.audioUrl);
    expect(audio.paused).toBe(false);
    const player = screen.getByRole('contentinfo', { name: 'Музыкальный плеер' });
    expect(within(player).getAllByText(first.title)).toHaveLength(2);
    expect(TestAudio.instances).toHaveLength(1);
  });

  it('избранное и ссылки магазина не запускают музыку и не меняют текущую композицию', async () => {
    await openApp();
    const audio = TestAudio.instances[0];
    const [firstRow, secondRow] = within(list()).getAllByRole('listitem');
    fireEvent.click(
      within(firstRow)
        .getByRole('button', {
          name: `Добавить в избранное: ${first.title}`,
        })
        .querySelector('svg')!,
    );
    fireEvent.click(within(firstRow).getByText('iTunes'));
    const discovery = screen.getByRole('region', { name: 'На волне хорошего дня' });
    const cards = within(discovery).getAllByRole('article');
    fireEvent.click(
      within(cards[1])
        .getByRole('button', {
          name: `Добавить в избранное: ${second.title}`,
        })
        .querySelector('svg')!,
    );
    fireEvent.click(within(cards[1]).getByRole('link', { name: /Открыть в iTunes/ }));
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.src).toBe('');
    expect(JSON.parse(window.localStorage.getItem('melodia:favorites')!)).toHaveLength(2);

    await act(async () => {
      fireEvent.click(
        within(firstRow).getByRole('button', {
          name: `Воспроизвести: ${first.title}`,
        }),
      );
    });
    const playCount = audio.play.mock.calls.length;
    fireEvent.click(
      within(secondRow).getByRole('button', {
        name: `Убрать из избранного: ${second.title}`,
      }),
    );
    fireEvent.click(within(secondRow).getByText('iTunes'));
    fireEvent.click(
      within(cards[0]).getByRole('button', {
        name: `Убрать из избранного: ${first.title}`,
      }),
    );
    fireEvent.click(within(cards[1]).getByRole('link', { name: /Открыть в iTunes/ }));
    expect(audio.play).toHaveBeenCalledTimes(playCount);
    expect(audio.src).toBe(first.audioUrl);
    expect(audio.paused).toBe(false);
  });

  it('по умолчанию возвращает каталог Apple, игнорирует прежний выбор Audius и сохраняет играющий трек при смене источника', async () => {
    window.localStorage.removeItem('melodia:source:v2');
    window.localStorage.setItem('melodia:source', 'audius');
    const fullTrack: Track = {
      id: 'audius:full',
      title: 'Полный трек Audius',
      artist: 'Новый автор',
      album: 'Audius',
      artworkUrl: 'https://example.test/full.jpg',
      audioUrl: 'https://api.audius.co/v1/tracks/full/stream',
      sourceUrl: 'https://audius.co/author/full',
      source: 'audius',
      playbackType: 'full',
      durationMs: 210000,
    };
    vi.mocked(getDiscoverMusic).mockImplementation(async (_signal, source) => ({
      tracks: source === 'itunes' ? [first, second] : [fullTrack],
      truncated: false,
    }));
    vi.mocked(searchMusic).mockImplementation(async (_query, _signal, source) => ({
      tracks: source === 'itunes' ? [first] : [fullTrack],
      truncated: false,
    }));
    await openApp();
    const selector = screen.getByRole('combobox', { name: 'Источник музыки' });
    expect((selector as HTMLSelectElement).value).toBe('itunes');
    expect((selector as HTMLSelectElement).options[0].value).toBe('itunes');
    expect(vi.mocked(getDiscoverMusic).mock.calls[0][1]).toBe('itunes');
    expect(within(list()).getByText(first.title)).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск музыки' }), {
      target: { value: 'электронная музыка' },
    });
    await finishSearch();
    expect(vi.mocked(searchMusic).mock.calls[0][2]).toBe('itunes');
    fireEvent.change(selector, { target: { value: 'audius' } });
    expect(screen.queryByRole('list', { name: 'Композиции' })).toBeNull();
    await finishSearch();
    expect(vi.mocked(searchMusic).mock.calls[1][2]).toBe('audius');
    expect(vi.mocked(getDiscoverMusic).mock.calls.at(-1)?.[1]).toBe('audius');
    await act(async () => {
      fireEvent.click(
        within(list()).getByRole('button', { name: `Воспроизвести: ${fullTrack.title}` }),
      );
    });
    const audio = TestAudio.instances[0];
    expect(audio.src).toBe(fullTrack.audioUrl);
    const player = screen.getByRole('contentinfo', { name: 'Музыкальный плеер' });
    expect(within(player).getAllByText(fullTrack.title)).toHaveLength(2);
    expect(player.textContent).not.toMatch(/фрагмент/i);
    fireEvent.change(selector, { target: { value: 'itunes' } });
    expect(screen.queryByRole('list', { name: 'Композиции' })).toBeNull();
    await finishSearch();
    expect(vi.mocked(searchMusic).mock.calls[2][2]).toBe('itunes');
    expect(vi.mocked(getDiscoverMusic).mock.calls.at(-1)?.[1]).toBe('itunes');
    expect(within(list()).getByText(first.title)).toBeTruthy();
    expect(within(player).getAllByText(fullTrack.title)).toHaveLength(2);
    expect(audio.src).toBe(fullTrack.audioUrl);
    expect(audio.paused).toBe(false);
    expect(TestAudio.instances).toHaveLength(1);
    expect(window.localStorage.getItem('melodia:source:v2')).toBe('itunes');
    expect(window.localStorage.getItem('melodia:source')).toBe('audius');
  });

  it('сохраняет новый явный выбор Audius при повторном открытии приложения', async () => {
    window.localStorage.setItem('melodia:source', 'itunes');
    window.localStorage.setItem('melodia:source:v2', 'audius');
    vi.mocked(getDiscoverMusic).mockResolvedValue({ tracks: [], truncated: false });
    const firstOpen = await openApp();
    expect(
      (screen.getByRole('combobox', { name: 'Источник музыки' }) as HTMLSelectElement).value,
    ).toBe('audius');
    expect(vi.mocked(getDiscoverMusic).mock.calls[0][1]).toBe('audius');
    firstOpen.unmount();
    await openApp();
    expect(
      (screen.getByRole('combobox', { name: 'Источник музыки' }) as HTMLSelectElement).value,
    ).toBe('audius');
    expect(vi.mocked(getDiscoverMusic).mock.calls.at(-1)?.[1]).toBe('audius');
    expect(window.localStorage.getItem('melodia:source:v2')).toBe('audius');
  });

  it('продолжает воспроизводить сохранённое избранное из прежней версии iTunes', async () => {
    window.localStorage.setItem(
      'melodia:favorites',
      JSON.stringify([
        {
          id: first.id,
          title: first.title,
          artist: first.artist,
          album: first.album,
          artworkUrl: first.artworkUrl,
          durationMs: first.durationMs,
          previewUrl: first.audioUrl,
          storeUrl: first.sourceUrl,
        },
      ]),
    );
    await openApp();
    fireEvent.click(screen.getByRole('button', { name: /^Избранное/ }));
    const favorites = screen.getByRole('list', { name: 'Избранные композиции' });
    expect(
      within(favorites).getByRole('link', { name: `Открыть ${first.title} в iTunes` }),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        within(favorites).getByRole('button', { name: `Воспроизвести: ${first.title}` }),
      );
    });
    expect(TestAudio.instances[0].src).toBe(first.audioUrl);
    expect(TestAudio.instances[0].paused).toBe(false);
    const player = screen.getByRole('contentinfo', { name: 'Музыкальный плеер' });
    expect(within(player).getAllByText(first.title)).toHaveLength(2);
    expect(player.textContent).toMatch(/фрагмент/i);
  });
});
