import { Heart, Search } from 'lucide-react';
import { TrackList, type TrackListProps } from './TrackList';

export function Favorites({ onSearch, ...listProps }: TrackListProps & { onSearch: () => void }) {
  if (listProps.tracks.length) return <TrackList {...listProps} favoritesSection />;
  return (
    <div className="empty-state">
      <span className="empty-icon coral">
        <Heart size={32} />
      </span>
      <h2>Здесь будет ваша музыка</h2>
      <p>
        Нажимайте на сердечко рядом с треком,
        <br />
        чтобы сохранить его в своей коллекции.
      </p>
      <button className="primary-button" onClick={onSearch}>
        <Search size={17} />
        Найти любимую музыку
      </button>
    </div>
  );
}
