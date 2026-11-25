import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Feedback, Loading, PortfolioImage } from '../../components/ui';
import { describeApiError, getSkillStatus, submitSkillSample } from '../../lib/api';
import { Field } from '../account/fields';
import { useSession } from '../account/session';
import { SkillBadge, SkillDate, SkillPagination } from './skillUi';

export function WorkerSkill({ slug }: { slug: string }) {
  const session = useSession();
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const key = ['private', 'skill', session.sessionKey, slug];
  const query = useQuery({
    queryKey: [...key, offset],
    queryFn: () => session.perform((token, signal) => getSkillStatus(slug, offset, token, signal)),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const sample = data?.samples.find(item => item.id === selected);
  const canSubmit = data && ['not_started', 'rejected', 'resubmission_required'].includes(data.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !sample || !canSubmit) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await session.perform((token, signal) => submitSkillSample(slug, sample.id, token, signal));
      setSelected('');
      setOffset(0);
      setMessage('Work sample submitted for review.');
    } catch (failure) {
      setError(describeApiError(failure));
    } finally {
      await client.invalidateQueries({ queryKey: key });
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="surface profile-section verification-pillar" id="skill-verification">
    <h2 tabIndex={-1}>Skill Verification</h2>
    <p className="section-detail">Submit a work sample from your public portfolio for review in your trade.</p>
    <div className="skill-stack">
      <p className="share-feedback" role="status" aria-atomic="true">{message}</p>
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      {query.isPending && <Loading label="Loading Skill Verification" />}
      {query.isError && <Feedback title="Couldn’t load Skill Verification" error
        action={<button className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
        {describeApiError(query.error)}
      </Feedback>}
      {data && !query.isError && <>
        <div className="skill-heading"><h3>Current status</h3><SkillBadge status={data.status} /></div>
        {data.current && <p>Submitted <SkillDate date={data.current.submitted_at} /> for {data.current.trade}.</p>}
        {data.current?.reason && <p className="notice preserve-lines"><strong>Reviewer feedback</strong><br />{data.current.reason}</p>}
        {canSubmit && (data.samples.length === 0
          ? <p>No work samples yet. <a href="#work-samples" className="text-link">Add a work sample</a> to submit evidence.</p>
          : <form className="account-form image-form" onSubmit={submit}>
            <Field id="skill-sample" label="Work sample">
              {attributes => <select {...attributes} required value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
                <option value="">Choose a sample</option>
                {data.samples.map((item, index) => <option key={item.id} value={item.id}>{item.caption || 'Work sample ' + (index + 1)}</option>)}
              </select>}
            </Field>
            {sample && <div className="skill-preview"><PortfolioImage key={sample.id} path={sample.image_url} caption={sample.caption} /></div>}
            <button type="submit" className="button primary" disabled={!sample || busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>
          </form>)}
        {data.history.length > 0 && <div>
          <h3>Submission history</h3>
          <ul className="review-list skill-history">{data.history.map(entry => <li key={entry.id}>
            <div><strong>{entry.sample.caption || 'Work sample'}</strong><SkillBadge status={entry.status} /></div>
            <p>Submitted <SkillDate date={entry.submitted_at} />{entry.decided_at && <> · Decided <SkillDate date={entry.decided_at} /></>}</p>
            {entry.reason && <p className="preserve-lines">{entry.reason}</p>}
          </li>)}</ul>
        </div>}
        <SkillPagination {...data.pagination} onPage={setOffset} />
      </>}
    </div>
  </section>;
}
