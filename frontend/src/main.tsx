import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { Feedback, Loading } from './components/ui';
import { Auth } from './features/account/Auth';
import { SessionProvider, useSession } from './features/account/session';
import { WorkerArea } from './features/account/WorkerArea';
import { Directory } from './features/directory/Directory';
import { Home } from './features/home/Home';
import { TrustCard } from './features/trust-card/TrustCard';
import './styles.css';

const AdminSkill = lazy(() => import('./features/verification/AdminSkill').then(module => ({ default: module.AdminSkill })));
const AdminIdentity = lazy(() => import('./features/verification/AdminIdentity').then(module => ({ default: module.AdminIdentity })));
const reviewFallback = <div className="shell account-page"><Loading label="Loading review queue" /></div>;

function ReviewWorkspace() {
  const session = useSession();
  return <>
    {session.me?.user.role === 'admin' && <div className="review-workspace">
      <nav className="shell review-tabs" aria-label="Verification review queues">
        <NavLink to="/admin/verification/identity">Identity reviews</NavLink>
        <NavLink to="/admin/verification/skill">Skill reviews</NavLink>
      </nav>
    </div>}
    <Outlet />
  </>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="workers" element={<Directory />} />
            <Route path="workers/:slug" element={<TrustCard />} />
            <Route path="login" element={<Auth key="login" mode="login" />} />
            <Route path="register" element={<Auth key="register" mode="register" />} />
            <Route path="onboarding" element={<WorkerArea onboarding />} />
            <Route path="dashboard" element={<WorkerArea />} />
            <Route path="admin/verification" element={<ReviewWorkspace />}>
              <Route index element={<Navigate to="identity" replace />} />
              <Route path="skill" element={<Suspense fallback={reviewFallback}><AdminSkill /></Suspense>} />
              <Route path="identity" element={<Suspense fallback={reviewFallback}><AdminIdentity /></Suspense>} />
            </Route>
            <Route path="*" element={<div className="shell page"><Feedback title="Page not found" action={<Link className="button primary" to="/">Back to home</Link>} /></div>} />
          </Route>
        </Routes>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
