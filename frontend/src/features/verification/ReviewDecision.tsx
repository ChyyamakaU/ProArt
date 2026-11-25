import { useState, type FormEvent } from 'react';
import type { SkillReview } from '../../lib/api';
import { Field } from '../account/fields';

export function DecisionForm({ id, busy, onReview, approvalLabel = 'Approve Skill Verification' }: {
  id: string; busy: boolean; approvalLabel?: string; onReview: (id: string, body: SkillReview) => Promise<void>;
}) {
  const [status, setStatus] = useState<'' | 'verified' | 'rejected' | 'resubmission_required'>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;
    if (status === 'verified') return void onReview(id, { status });
    if (!reason.trim()) return setError('Enter a reason the worker can use to understand this decision.');
    void onReview(id, { status, reason: reason.trim() });
  }

  return <form className="account-form" onSubmit={submit}>
    <fieldset className="account-form" disabled={busy}>
      <Field id={'decision-' + id} label="Decision">
        {attributes => <select {...attributes} required value={status} onChange={event => {
          setStatus(event.target.value as typeof status);
          setError('');
        }}>
          <option value="">Choose a decision</option>
          <option value="verified">{approvalLabel}</option>
          <option value="rejected">Reject</option>
          <option value="resubmission_required">Request resubmission</option>
        </select>}
      </Field>
      {status && status !== 'verified' && <Field id={'reason-' + id} label="Reason" hint="This feedback is visible to the worker. Do not include private identifiers." error={error}>
        {attributes => <textarea {...attributes} rows={3} maxLength={1000} value={reason} onChange={event => {
          setReason(event.target.value);
          setError('');
        }} />}
      </Field>}
      <button className="button primary" type="submit" disabled={!status}>Save decision</button>
    </fieldset>
  </form>;
}
