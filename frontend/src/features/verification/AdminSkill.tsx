import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Feedback, Loading, PortfolioImage } from '../../components/ui';
import { describeApiError, getSkillQueue, reviewSkillSubmission, type SkillQueueFilter, type SkillReview } from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';
import { Field } from '../account/fields';
import { useSession } from '../account/session';
import { SkillBadge, SkillDate, SkillPagination } from './skillUi';
import { DecisionForm } from './ReviewDecision';

export function AdminSkill() {
  const session = useSession();
  usePageMetadata('Skill review queue | ProVart', 'Review Skill Verification evidence submitted by workers.');
  if (!session.signedIn) return <Navigate to="/login" replace />;
  if (!session.me) return <div className="shell account-page">{session.error
    ? <Feedback title="Couldn’t load your account" error
      action={<button className="button secondary" onClick={() => void session.refresh().catch(() => undefined)}>Try again</button>}>
      {describeApiError(session.error)}
    </Feedback> : <Loading label="Checking administrator access" />}</div>;
  if (session.me.user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <Queue />;
}

function Queue() {
  const session = useSession();
  const client = useQueryClient();
  const [filter, setFilter] = useState<SkillQueueFilter>('active');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const key = ['private', 'skill-queue', session.sessionKey];
  const query = useQuery({
    queryKey: [...key, filter, offset],
    queryFn: () => session.perform((token, signal) => getSkillQueue(filter, offset, token, signal)),
    staleTime: 0, refetchOnWindowFocus: true,
  });

  async function review(id: string, body: SkillReview) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await session.perform((token, signal) => reviewSkillSubmission(id, body, token, signal));
      setMessage(body.status === 'under_review' ? 'Review started.' : 'Review decision saved.');
    } catch (failure) {
      setError(describeApiError(failure));
    } finally {
      await client.invalidateQueries({ queryKey: key });
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="shell account-page skill-stack">
    <header className="queue-heading"><p className="eyebrow">Administrator workspace</p>
      <h1 className="skill-title">Skill review queue</h1>
      <p>Inspect the submitted portfolio sample and assess whether it demonstrates the work of the stated trade.</p>
    </header>
    <div className="surface queue-toolbar">
      <Field id="skill-queue-filter" label="Submissions">
        {attributes => <select {...attributes} value={filter} disabled={busy} onChange={event => {
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
    {query.isPending && <Loading label="Loading review queue" />}
    {query.isError && <Feedback title="Couldn’t load the review queue" error
      action={<button className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
      {describeApiError(query.error)}
    </Feedback>}
    {query.data && !query.isError && <>
      {!query.data.data.length && <Feedback title="No matching skill submissions">Choose another status to see previous decisions.</Feedback>}
      {query.data.data.map(item => <article className="surface profile-section skill-review" key={item.id}>
        <div className="skill-preview"><PortfolioImage path={item.sample.image_url} caption={item.sample.caption} /></div>
        <div className="skill-stack">
          <div className="skill-heading"><h2>{item.worker.full_name}</h2><SkillBadge status={item.status} /></div>
          <p>{item.trade} · Submitted <SkillDate date={item.submitted_at} /></p>
          {item.decided_at && <p>Decision recorded <SkillDate date={item.decided_at} />.</p>}
          {item.sample.caption && <p>{item.sample.caption}</p>}
          <Link className="text-link" to={'/workers/' + encodeURIComponent(item.worker.slug)}>Open public Trust Card</Link>
          {item.reason && <p className="preserve-lines">Reviewer feedback: {item.reason}</p>}
          {!item.can_review && filter === 'active' && <p>Another administrator must review this profile.</p>}
          {item.can_review && item.status === 'submitted' && <div>
            <button className="button primary" disabled={busy} onClick={() => void review(item.id, { status: 'under_review' })}>Start review</button>
          </div>}
          {item.can_review && item.status === 'under_review' && <DecisionForm id={item.id} busy={busy} onReview={review} />}
        </div>
      </article>)}
      <SkillPagination {...query.data.pagination} onPage={setOffset} />
    </>}
  </div>;
}
