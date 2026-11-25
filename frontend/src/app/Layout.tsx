import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Brand } from '../components/ui';
import { useSession } from '../features/account/session';

export function Layout() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
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

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/workers">Professionals</NavLink>
          {session.signedIn ? <>
            {session.me?.user.role === 'admin'
              ? <NavLink to="/admin/verification">Verification reviews</NavLink>
              : <NavLink to={session.me?.worker === null && session.me.user.role === 'worker' ? '/onboarding' : '/dashboard'}>Dashboard</NavLink>}
            <button type="button" onClick={() => { session.signOut(); void navigate('/login', { replace: true }); }}>Sign out</button>
          </> : <><NavLink to="/login">Sign in</NavLink><NavLink className="nav-join" to="/register">Join ProArt</NavLink></>}
        </nav>
      </div>
    </header>
    <main id="main" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><div className="shell footer-inner">
      <div><Brand /><p>Skills you can prove. Trust you can build.</p></div>
      <nav aria-label="Footer navigation">
        <Link to="/workers">Explore professionals</Link>
        <Link to="/#verification">How verification works</Link>
        <Link to="/register">Create a Trust Card</Link>
      </nav>
    </div></footer>
  </>;
}
