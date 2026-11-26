import { ImageOff, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/api';

export function Brand() {
  return <Link className="brand" to="/" aria-label="ProVart home">
    <span className="brand-mark" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2.2} /></span>
    <span className="brand-word">Pro<span className="brand-accent">Vart</span></span>
  </Link>;
}

export function Avatar({ name, path }: { name: string; path: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(path);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <span className="avatar" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span className="avatar-monogram">{initials || 'SV'}</span>}
  </span>;
}

export function PortfolioImage({ path, caption, eager = false }: { path: string; caption: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(path);
  return src && !failed
    ? <img className="portfolio-image" src={src} alt={caption || 'Work sample'} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
    : <div className="portfolio-placeholder"><ImageOff size={24} aria-hidden="true" /><span>Image unavailable</span></div>;
}

export function Feedback({ title, children, action, error = false }: {
  title: string; children?: ReactNode; action?: ReactNode; error?: boolean;
}) {
  return <div className="feedback">
    <div role={error ? 'alert' : 'status'}><h2>{title}</h2>{children && <p>{children}</p>}</div>
    {action}
  </div>;
}

export function Loading({ label, cards = 1 }: { label: string; cards?: number }) {
  return <div className="results-grid" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: cards }, (_, index) => <div className="skeleton" key={index} aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}
