import { Clock3, Search, X, ArrowUpLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  history: string[];
  onClearHistory: () => void;
}

export function SearchBox({ value, onChange, history, onClearHistory }: Props) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const showHistory = focused && !value.trim() && history.length > 0 && !dismissed;
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setFocused(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return (
    <div
      className="search-container"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDismissed(true);
          input.current?.focus();
        }
      }}
    >
      <form
        className="search-field"
        onSubmit={(event) => {
          event.preventDefault();
          setDismissed(true);
          input.current?.blur();
        }}
        role="search"
      >
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="Поиск музыки"
          placeholder="Трек, исполнитель или альбом"
          maxLength={200}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          aria-expanded={showHistory}
          aria-controls={showHistory ? 'search-history' : undefined}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="search-clear icon-button"
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
            aria-label="Очистить поиск"
            title="Очистить поиск"
          >
            <X size={17} />
          </button>
        ) : (
          <span className="search-hint">Найдите своё звучание</span>
        )}
      </form>
      {showHistory && (
        <div className="search-history" id="search-history" aria-label="Недавние запросы">
          <div className="history-heading">
            <span>Недавно искали</span>
            <button onClick={onClearHistory}>Очистить</button>
          </div>
          {history.map((query) => (
            <button
              className="history-query"
              key={query}
              onClick={() => {
                onChange(query);
                setDismissed(true);
                input.current?.focus();
              }}
            >
              <Clock3 size={16} />
              <span>{query}</span>
              <ArrowUpLeft size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
