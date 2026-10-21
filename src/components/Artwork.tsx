import { Music2 } from 'lucide-react';
import { useState } from 'react';

export function Artwork({
  url,
  title,
  className = '',
}: {
  url?: string;
  title: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span className={`artwork ${className}`}>
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Music2 aria-hidden="true" />
      )}
    </span>
  );
}
