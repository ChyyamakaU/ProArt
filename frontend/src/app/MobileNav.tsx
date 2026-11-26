import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export type MobileNavItem = {
  key: string;
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: 'link' | 'primary';
  end?: boolean;
};

function getFocusable(container: HTMLElement | null) {
  if (!container) return [] as HTMLElement[];
  return Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
}

export function MobileNav({ items, solidHeader, onOpenChange }: { items: MobileNavItem[]; solidHeader: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  const location = useLocation();
  const panelId = 'mobile-nav';
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const setOpen = (value: boolean | ((v: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (next !== prev) onOpenChange?.(next);
      return next;
    });
  };

  useEffect(() => { setOpen(false); }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(panelRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => { if (window.innerWidth >= 768) setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const focusable = getFocusable(panelRef.current);
      focusable[0]?.focus();
      wasOpen.current = true;
      return () => { document.body.style.overflow = previous; };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
    return undefined;
  }, [open]);

  const links = items.filter((item) => item.variant !== 'primary');
  const primary = items.find((item) => item.variant === 'primary');

  return (
    <div className="mobile-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`mobile-menu-toggle ${solidHeader || open ? 'is-solid' : ''}`.trim()}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
      </button>

      {open && <div className="mobile-menu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}

      <div
        id={panelId}
        ref={panelRef}
        className={`mobile-menu-panel ${open ? 'is-open' : ''}`.trim()}
        aria-hidden={!open}
      >
        <nav aria-label="Mobile">
          <div className="mobile-menu-links">
            {links.map((item) => item.to ? (
              <NavLink key={item.key} to={item.to} end={item.end} className="mobile-menu-link" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
                {item.label}
              </NavLink>
            ) : (
              <button key={item.key} type="button" className="mobile-menu-link mobile-menu-button" onClick={() => { item.onClick?.(); setOpen(false); }} tabIndex={open ? 0 : -1}>
                {item.label}
              </button>
            ))}
          </div>
          {primary && primary.to && (
            <NavLink key={primary.key} to={primary.to} className="mobile-menu-primary" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
              {primary.label}
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  );
}
