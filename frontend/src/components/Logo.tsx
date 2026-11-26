type LogoSize = 'sm' | 'md' | 'lg' | 'nav';

const heights: Record<LogoSize, number> = { sm: 32, md: 40, lg: 48, nav: 56 };
const widths: Record<LogoSize, number> = { sm: 48, md: 60, lg: 72, nav: 84 };

export function Logo({
  size = 'md',
  withWordmark = true,
  className = '',
  eager = false,
  alt,
}: {
  size?: LogoSize;
  withWordmark?: boolean;
  className?: string;
  eager?: boolean;
  alt?: string;
}) {
  const height = heights[size];
  const width = widths[size];
  const imgAlt = alt ?? (withWordmark ? '' : 'ProVart');
  return (
    <span className={`brand-logo ${withWordmark ? 'brand-logo-wordmark' : ''} ${className}`.trim()}>
      <img
        src="/icons/logo.png"
        alt={imgAlt}
        width={width}
        height={height}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        className="brand-logo-img"
      />
      {withWordmark && <span className="brand-wordmark">Pro<span className="brand-accent">Vart</span></span>}
    </span>
  );
}
