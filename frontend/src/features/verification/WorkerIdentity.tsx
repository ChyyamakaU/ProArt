import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Feedback, Loading } from '../../components/ui';
import { describeApiError, getIdentityStatus, submitIdentityDocument, type IdentityDocumentType } from '../../lib/api';
import { Field } from '../account/fields';
import { useSession } from '../account/session';
import { SkillBadge, SkillDate, SkillPagination } from './skillUi';

export const identityTypes: Record<IdentityDocumentType, string> = {
  national_id: 'National identity card', passport: 'Passport',
  drivers_license: 'Driver’s licence', voter_card: 'Voter’s card',
};
const formats = ['image/jpeg', 'image/png', 'image/webp'];

export function WorkerIdentity({ slug }: { slug: string }) {
  const session = useSession();
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<IdentityDocumentType | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const lock = useRef(false);
  const documentInput = useRef<HTMLInputElement>(null);
  const key = ['private', 'identity', session.sessionKey, slug];
  const query = useQuery({
    queryKey: [...key, offset],
    queryFn: () => session.perform((token, signal) => getIdentityStatus(slug, offset, token, signal)),
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const data = query.data;
  const canSubmit = data?.available && ['not_started', 'rejected', 'resubmission_required'].includes(data.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !type || lock.current) return;
    const file = documentInput.current?.files?.[0];
    setError('');
    setMessage('');
    setFileError('');
    if (!file?.size || file.size > 5 * 1024 * 1024 || !formats.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setFileError(!file?.size ? 'Choose a document image.' : 'Choose a JPEG, PNG, or WebP image of 5 MiB or less.');
      documentInput.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await session.perform((token, signal) => submitIdentityDocument(slug, type, file, token, signal));
      setType('');
      if (documentInput.current) documentInput.current.value = '';
      setOffset(0);
      setMessage('Identity document submitted for administrator review.');
    } catch (failure) {
      setError(describeApiError(failure));
    } finally {
      await client.invalidateQueries({ queryKey: key });
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="surface profile-section verification-pillar" id="identity-verification">
    <h2 tabIndex={-1}>Identity Verification</h2>
    <p className="section-detail">Submit an image of a government-issued ID so an administrator can review the name associated with your Trust Card. Your document is kept private and accessible to authorised reviewers. A submission stays pending until an administrator reviews it.</p>
    <div className="skill-stack">
      <p className="share-feedback" role="status" aria-atomic="true">{message}</p>
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      {query.isPending && <Loading label="Loading Identity Verification" />}
      {query.isError && <Feedback title="Couldn’t load Identity Verification" error
        action={<button type="button" className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
        {describeApiError(query.error)}
      </Feedback>}
      {data && !query.isError && <>
        <div className="skill-heading"><h3>Current status</h3><SkillBadge status={data.status} /></div>
        {data.current && <p>{identityTypes[data.current.document_type]} submitted <SkillDate date={data.current.submitted_at} />.</p>}
        {data.current?.reason && <p className="notice preserve-lines"><strong>Reviewer feedback</strong><br />{data.current.reason}</p>}
        {!data.available && <p className="notice">Identity document uploads are currently unavailable.</p>}
        {canSubmit && <form className="account-form image-form" onSubmit={submit}>
          <fieldset className="account-form" disabled={busy}>
            <Field id="identity-document-type" label="Government-issued document type">
              {props => <select {...props} required value={type} onChange={event => setType(event.target.value as IdentityDocumentType | '')}>
                <option value="">Choose a document type</option>
                {Object.entries(identityTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>}
            </Field>
            <Field id="identity-document" label="Document image"
              hint="Upload one clear image showing your name and document details. JPEG, PNG, or WebP, up to 5 MiB."
              error={fileError || undefined}>
              {props => <input {...props} ref={documentInput} type="file" accept={formats.join(',')} onChange={() => setFileError('')} />}
            </Field>
            <button type="submit" className="button primary">{busy ? 'Submitting…' : 'Submit for review'}</button>
          </fieldset>
        </form>}
        {data.history.length > 0 && <div>
          <h3>Submission history</h3>
          <ul className="review-list skill-history">{data.history.map(item => <li key={item.id}>
            <div><strong>{identityTypes[item.document_type]}</strong><SkillBadge status={item.status} /></div>
            <p>Submitted <SkillDate date={item.submitted_at} />{item.decided_at && <> · Decided <SkillDate date={item.decided_at} /></>}</p>
            {item.reason && <p className="preserve-lines">{item.reason}</p>}
          </li>)}</ul>
        </div>}
        <SkillPagination {...data.pagination} onPage={setOffset} />
      </>}
    </div>
  </section>;
}
