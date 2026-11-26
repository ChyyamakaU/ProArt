import { useState, type ReactNode } from 'react';

type Props = {
  src: string;
  fallback?: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  decoding?: 'async' | 'sync' | 'auto';
  width?: number;
  height?: number;
  sizes?: string;
  icon?: ReactNode;
  caption?: string;
  objectPosition?: string;
};

export function HomeImage({
  src, fallback, alt, className, placeholderClassName, loading = 'lazy', fetchPriority, decoding = 'async', width, height, sizes, icon, caption = 'Photo coming soon', objectPosition,
}: Props) {
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const activeSrc = !failedPrimary ? src : (fallback && !failedFallback ? fallback : undefined);

  if (!activeSrc) {
    return (
      <div
        className={`photo-placeholder ${placeholderClassName ?? ''}`.trim()}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <div className="photo-placeholder-inner">
          {icon ? <span className="photo-placeholder-icon" aria-hidden="true">{icon}</span> : null}
          <span className="photo-placeholder-caption">{caption}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={activeSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      sizes={sizes}
      style={objectPosition ? { objectPosition } : undefined}
      onError={() => {
        if (!failedPrimary) setFailedPrimary(true);
        else setFailedFallback(true);
      }}
    />
  );
}
