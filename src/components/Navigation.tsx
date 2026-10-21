import { AudioLines, Heart, Moon, Search, Sun, ArrowUpRight } from 'lucide-react';
import type { MusicSource, Section } from '../types';

interface Props {
  section: Section;
  onSection: (section: Section) => void;
  count: number;
  theme: 'light' | 'dark';
  onTheme: () => void;
  source: MusicSource;
}

export function Navigation({ section, onSection, count, theme, onTheme, source }: Props) {
  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() => onSection('search')}
        aria-label="Melodia — перейти к поиску"
      >
        <span className="brand-mark">
          <AudioLines size={24} strokeWidth={2.6} />
        </span>
        <span>
          melodia<span className="brand-dot">.</span>
        </span>
      </button>
      <p className="nav-caption">ВАША МУЗЫКА</p>
      <nav aria-label="Основная навигация">
        <button
          className={`nav-item ${section === 'search' ? 'active' : ''}`}
          onClick={() => onSection('search')}
          aria-label="Поиск"
          aria-current={section === 'search' ? 'page' : undefined}
        >
          <Search size={19} />
          <span>Поиск</span>
        </button>
        <button
          className={`nav-item ${section === 'favorites' ? 'active' : ''}`}
          onClick={() => onSection('favorites')}
          aria-label={`Избранное ${count}`}
          aria-current={section === 'favorites' ? 'page' : undefined}
        >
          <Heart size={19} />
          <span>Избранное</span>
          <span className="nav-count">{count}</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="small-note-icon">
            <AudioLines size={18} />
          </span>
          <strong>
            Музыка ближе,
            <br />
            чем кажется.
          </strong>
          <p>
            Найдите то, что звучит
            <br />в унисон с вами.
          </p>
        </div>
        <button
          className="theme-toggle"
          onClick={onTheme}
          title={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
          aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          <span>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</span>
        </button>
        <a
          className="source-sidebar"
          href={source === 'audius' ? 'https://audius.co' : 'https://www.apple.com/itunes/'}
          target="_blank"
          rel="noreferrer"
        >
          Музыка из {source === 'audius' ? 'Audius' : 'iTunes'} <ArrowUpRight size={13} />
        </a>
      </div>
    </aside>
  );
}
