import type { MusicSource } from '../types';

interface MusicCreditsProps {
  source: MusicSource;
  showBothSources: boolean;
}

export function MusicCredits({ source, showBothSources }: MusicCreditsProps) {
  const showAudius = showBothSources || source === 'audius';
  const showItunes = showBothSources || source === 'itunes';

  return (
    <footer className="content-footer">
      <span className="footer-brand">melodia.</span>
      <span>Откройте музыку, которая станет вашей.</span>
      <span>
        {showBothSources && (
          <>
            Полные записи из Audius и фрагменты из iTunes.
            <br />
          </>
        )}
        {showItunes && (
          <>
            Обложки и фрагменты предоставлены iTunes.
            <br />
            {!showBothSources && (
              <>
                Каталог США · фрагменты до 90 секунд.
                <br />
              </>
            )}
          </>
        )}
        {showAudius && (
          <>
            {!showBothSources && (
              <>
                <a href="https://audius.co" target="_blank" rel="noreferrer">
                  Музыка и обложки из Audius.
                </a>
                <br />
                Открытый каталог исполнителей · полные композиции.
                <br />
              </>
            )}
            <a href="https://audius.org/open-music-license.pdf" target="_blank" rel="noreferrer">
              Открытая музыкальная лицензия Audius
            </a>
          </>
        )}
        {showBothSources && ' · '}
        {showItunes && 'iTunes Store — товарный знак Apple Inc.'}
      </span>
    </footer>
  );
}
