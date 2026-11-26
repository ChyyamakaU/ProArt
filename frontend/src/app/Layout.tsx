import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Brand } from '../components/ui';
import { useSession } from '../features/account/session';
import { MobileNav, type MobileNavItem } from './MobileNav';

export function Layout() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const isHome = pathname === '/';
  const isAuth = pathname === '/login' || pathname === '/register';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView();
      (target?.matches('h2[tabindex]') ? target : target?.querySelector<HTMLElement>('h2[tabindex]'))?.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  useEffect(() => {
    if (!isHome) {
      setScrolled(false);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  const accountTo = session.me?.user.role === 'admin'
    ? '/admin/verification'
    : session.me?.worker === null && session.me?.user.role === 'worker'
      ? '/onboarding'
      : '/dashboard';

  if (isAuth) {
    return <main id="main" tabIndex={-1} className="auth-main"><Outlet /></main>;
  }

  const navItems: MobileNavItem[] = session.signedIn
    ? [
        { key: 'pros', label: 'Professionals', to: '/workers' },
        { key: 'account', label: session.me?.user.role === 'admin' ? 'Reviews' : 'Dashboard', to: accountTo },
        { key: 'signout', label: 'Sign out', onClick: () => { session.signOut(); void navigate('/login', { replace: true }); } },
      ]
    : [
        { key: 'pros', label: 'Professionals', to: '/workers' },
        { key: 'signin', label: 'Sign in', to: '/login' },
        { key: 'join', label: 'Join ProVart', to: '/register', variant: 'primary' },
      ];

  const solidHeader = scrolled || mobileOpen;

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className={`site-header ${isHome ? 'is-home' : ''} ${solidHeader ? 'is-scrolled' : ''} ${mobileOpen ? 'is-menu-open' : ''}`.trim()}>
      <div className="shell header-inner">
        <Brand size="nav" eager />
        <nav aria-label="Main" className="desktop-nav">
          {navItems.map((item) => item.to ? (
            <NavLink key={item.key} to={item.to} end={item.end} className={item.variant === 'primary' ? 'nav-join' : undefined}>
              {item.label}
            </NavLink>
          ) : (
            <button key={item.key} type="button" onClick={item.onClick}>{item.label}</button>
          ))}
        </nav>
        <MobileNav items={navItems} solidHeader={isHome && !solidHeader ? false : true} onOpenChange={setMobileOpen} />
      </div>
    </header>

    <main id="main" tabIndex={-1}><Outlet /></main>

    <footer className="site-footer">
      <div className="shell footer-inner">
        <div className="footer-brand">
          <Brand />
          <p>Verified skills for Nigeria&apos;s artisans.</p>
        </div>
        <div className="footer-col">
          <h2>Explore</h2>
          <Link to="/workers">Professionals</Link>
          <Link to="/#verification">How verification works</Link>
        </div>
        <div className="footer-col">
          <h2>Account</h2>
          {session.signedIn
            ? <Link to={accountTo}>Your account</Link>
            : <><Link to="/login">Sign in</Link><Link to="/register">Create a Trust Card</Link></>}
        </div>
        <div className="footer-col">
          <h2>ProVart</h2>
          <p>Skills you can prove. Trust you can hire.</p>
        </div>
      </div>
      <div className="shell footer-bottom">
        <p>ProVart Trust Card for skilled professionals.</p>
      </div>
    </footer>
  </>;
}
