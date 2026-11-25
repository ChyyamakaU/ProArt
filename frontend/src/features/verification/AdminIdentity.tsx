import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Feedback, Loading } from '../../components/ui';
import { describeApiError, getIdentityDocument, getIdentityQueue, reviewIdentitySubmission, type SkillQueueFilter, type SkillReview } from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';
import { Field } from '../account/fields';
import { useSession } from '../account/session';
import { DecisionForm } from './ReviewDecision';
import { identityTypes } from './WorkerIdentity';
import { SkillBadge, SkillDate, SkillPagination } from './skillUi';

export function AdminIdentity() {
  const session = useSession();
  usePageMetadata('Identity review queue | SkillVerify', 'Review submitted identity documents.');
  if (!session.signedIn) return <Navigate to="/login" replace />;
  if (!session.me) return <div className="shell account-page">{session.error
    ? <Feedback title="Couldn’t load your account" error
        action={<button className="button secondary" onClick={() => void session.refresh().catch(() => undefined)}>Try again</button>}>
        {describeApiError(session.error)}
      </Feedback> : <Loading label="Checking administrator access" />}</div>;
  if (session.me.user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <IdentityQueue />;
}

function IdentityQueue() {
  const session = useSession();
  const client = useQueryClient();
  const [filter, setFilter] = useState<SkillQueueFilter>('active');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const key = ['private', 'identity-queue', session.sessionKey];
  const query = useQuery({
    queryKey: [...key, filter, offset],
    queryFn: () => session.perform((token, signal) => getIdentityQueue(filter, offset, token, signal)),
    staleTime: 0, refetchOnWindowFocus: true,
  });

  async function review(id: string, body: SkillReview) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await session.perform((token, signal) => reviewIdentitySubmission(id, body, token, signal));
      if (body.status !== 'under_review') setOpenId('');
      setMessage(body.status === 'under_review' ? 'Review started.' : 'Identity review decision saved.');
    } catch (failure) {
      setError(describeApiError(failure));
    } finally {
      await client.invalidateQueries({ queryKey: key });
      lock.current = false;
      setBusy(false);
    }
  }

  return <div className="shell account-page skill-stack">
    <header className="queue-heading"><p className="eyebrow">Administrator workspace</p>
      <h1 className="skill-title">Identity review queue</h1>
      <p>Compare the government-issued document with the name submitted by the worker. Each document access is recorded.</p>
    </header>
    <div className="surface queue-toolbar">
      <Field id="identity-queue-filter" label="Submissions">
        {props => <select {...props} value={filter} disabled={busy} onChange={event => {
          setOpenId('');
          setFilter(event.target.value as SkillQueueFilter);
          setOffset(0);
        }}>
          <option value="active">Active reviews</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="resubmission_required">Resubmission required</option>
        </select>}
      </Field>
    </div>
    <p className="share-feedback" role="status" aria-atomic="true">{message}</p>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    {query.isPending && <Loading label="Loading identity review queue" />}
    {query.isError && <Feedback title="Couldn’t load the identity review queue" error
      action={<button className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
      {describeApiError(query.error)}
    </Feedback>}
    {query.data && !query.isError && <>
      {!query.data.data.length && <Feedback title="No matching identity submissions">Choose another status to see previous decisions.</Feedback>}
      {query.data.data.map(item => <article className="surface profile-section skill-stack identity-review-card" key={item.id}>
        <div className="skill-heading"><h2>{item.full_name}</h2><SkillBadge status={item.status} /></div>
        <p>{identityTypes[item.document_type]} · Submitted <SkillDate date={item.submitted_at} /></p>
        {item.decided_at && <p>Decision recorded <SkillDate date={item.decided_at} />.</p>}
        {item.reason && <p className="preserve-lines">Reviewer feedback: {item.reason}</p>}
        {item.can_view_document && <div>
          <button type="button" className="button secondary" aria-expanded={openId === item.id}
            onClick={() => setOpenId(openId === item.id ? '' : item.id)}>{openId === item.id ? 'Close document' : 'Open private document'}</button>
          {openId === item.id && <DocumentPreview id={item.id} />}
        </div>}
        {!item.can_review && filter === 'active' && <p>Another administrator must review this profile.</p>}
        {item.can_review && item.status === 'submitted' && <div>
          <button type="button" className="button primary" disabled={busy} onClick={() => void review(item.id, { status: 'under_review' })}>Start review</button>
        </div>}
        {item.can_review && item.status === 'under_review' &&
          <DecisionForm id={item.id} busy={busy} onReview={review} approvalLabel="Approve Identity Verification" />}
      </article>)}
      <SkillPagination {...query.data.pagination} onPage={next => { setOpenId(''); setOffset(next); }} />
    </>}
  </div>;
}

function DocumentPreview({ id }: { id: string }) {
  const { perform } = useSession();
  const activeRequest = useRef(perform);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    activeRequest.current(async (token, sessionSignal) => {
      function cancel() { controller.abort(); }
      sessionSignal.addEventListener('abort', cancel, { once: true });
      try {
        if (sessionSignal.aborted) cancel();
        const document = await getIdentityDocument(id, token, controller.signal);
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(document);
          setUrl(objectUrl);
        }
      } finally {
        sessionSignal.removeEventListener('abort', cancel);
      }
    }).catch(failure => {
      if (!controller.signal.aborted) setError(describeApiError(failure));
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (error) return <p className="notice error-notice" role="alert">{error}</p>;
  if (!url) return <p className="field-hint" role="status">Loading private document…</p>;
  return <img className="identity-preview" src={url} alt="Submitted government-issued identity document" />;
}
