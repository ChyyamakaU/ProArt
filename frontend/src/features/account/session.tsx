import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, getMe, type OwnedWorker, type WorkerSession } from '../../lib/api';

const privateKey = ['private', 'me'] as const;
type SessionHandle = { token: string; controller: AbortController; id: number };

function expiryHint(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function useSessionState() {
  const client = useQueryClient();
  const [session, setSession] = useState<SessionHandle>();
  const [expired, setExpired] = useState(false);
  const current = useRef<SessionHandle | undefined>(undefined);
  const counter = useRef(0);
  const query = useQuery({
    queryKey: [...privateKey, session?.id],
    queryFn: ({ signal }) => getMe(session!.token, signal),
    enabled: Boolean(session),
  });

  function clear(isExpired = false) {
    current.current?.controller.abort();
    current.current = undefined;
    void client.cancelQueries({ queryKey: ['private'] });
    client.removeQueries({ queryKey: ['private'] });
    setSession(undefined);
    setExpired(isExpired);
  }

  function start(token: string) {
    clear();
    const next = { token, controller: new AbortController(), id: ++counter.current };
    current.current = next;
    setSession(next);
  }

  useEffect(() => {
    if (session && current.current === session && query.error instanceof ApiError && query.error.status === 401) clear(true);
  }, [query.error, session]);

  useEffect(() => {
    if (!session) return;
    // The API validates the token. The expiry claim only schedules local sign-out.
    const expiresAt = expiryHint(session.token);
    if (expiresAt === undefined) return;
    let timer: number;
    function schedule() {
      if (current.current !== session) return;
      const remaining = expiresAt! - Date.now();
      if (remaining <= 0) clear(true);
      else timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    }
    schedule();
    return () => window.clearTimeout(timer);
  }, [session]);

  async function perform<T>(operation: (token: string, signal: AbortSignal) => Promise<T>) {
    const active = current.current;
    if (!active) throw new ApiError(401);
    try {
      const result = await operation(active.token, active.controller.signal);
      if (current.current !== active) throw new DOMException('Session ended.', 'AbortError');
      return result;
    } catch (error) {
      if (current.current === active && error instanceof ApiError && error.status === 401) clear(true);
      throw error;
    }
  }

  async function refresh() {
    const active = current.current;
    if (!active) throw new ApiError(401);
    const result = await query.refetch({ cancelRefetch: false, throwOnError: true });
    if (current.current !== active || !result.data) throw new ApiError(401);
    return result.data;
  }

  function refreshPublic(slug: string) {
    void client.invalidateQueries({ queryKey: ['worker', slug] });
    void client.invalidateQueries({ queryKey: ['workers'] });
    void client.invalidateQueries({ queryKey: ['worker-filters'] });
  }

  function saveWorker(worker: OwnedWorker) {
    if (!session || current.current !== session) return;
    client.setQueryData<WorkerSession>([...privateKey, session.id], value => value && { ...value, worker });
    void client.invalidateQueries({ queryKey: ['private', 'skill', session.id, worker.slug] });
    refreshPublic(worker.slug);
  }

  return {
    signedIn: Boolean(session), sessionKey: session?.id, expired, me: query.data, error: query.error, start,
    signOut: () => clear(), perform, refresh, saveWorker,
  };
}

const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required.');
  return session;
}
