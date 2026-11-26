import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  decoding?: 'async' | 'sync' | 'auto';
  width?: number;
  height?: number;
  sizes?: string;
  label: string;
};

export function HomeImage({
  src, alt, className, placeholderClassName, loading = 'lazy', fetchPriority, decoding = 'async', width, height, sizes, label,
}: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div
      className={`photo-placeholder ${placeholderClassName ?? ''}`.trim()}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span className="photo-placeholder-label">{label}</span>
    </div>;
  }
  return <img
    className={className}
    src={src}
    alt={alt}
    loading={loading}
    decoding={decoding}
    fetchPriority={fetchPriority}
    width={width}
    height={height}
    sizes={sizes}
    onError={() => setFailed(true)}
  />;
}
