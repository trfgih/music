import { AudioLines } from 'lucide-react';
import type { MusicSource } from '../types';

export function SourceSelector({
  value,
  onChange,
}: {
  value: MusicSource;
  onChange: (source: MusicSource) => void;
}) {
  return (
    <div className="source-bar">
      <label className="source-select">
        <span>Каталог музыки</span>
        <select
          aria-label="Источник музыки"
          value={value}
          onChange={(event) => onChange(event.target.value as MusicSource)}
        >
          <option value="itunes">iTunes — фрагменты</option>
          <option value="audius">Audius — полные треки</option>
        </select>
      </label>
      <span className={`source-mode ${value === 'audius' ? 'full-mode' : ''}`}>
        <AudioLines size={15} />
        {value === 'audius' ? 'Полные треки · без подписки' : 'Фрагменты из каталога iTunes'}
      </span>
    </div>
  );
}
