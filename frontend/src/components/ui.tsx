import { Eye, EyeOff, ImageOff } from 'lucide-react';
import { forwardRef, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/api';
import { Logo } from './Logo';

export function Brand({ size = 'md', eager = false }: { size?: 'sm' | 'md' | 'lg'; eager?: boolean }) {
  return <Link className="brand" to="/" aria-label="ProVart home">
    <Logo size={size} withWordmark={false} eager={eager} alt="" />
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

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, id, ...props }, forwardedRef,
) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function setRefs(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  return (
    <div className="password-input-wrap">
      <input
        {...props}
        ref={setRefs}
        id={id}
        type={visible ? 'text' : 'password'}
        className={`password-input ${className ?? ''}`.trim()}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const input = inputRef.current;
          const start = input?.selectionStart;
          const end = input?.selectionEnd;
          setVisible((v) => !v);
          requestAnimationFrame(() => {
            if (!input) return;
            input.focus();
            if (start !== null && start !== undefined && end !== null && end !== undefined) {
              input.setSelectionRange(start, end);
            }
          });
        }}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
});
