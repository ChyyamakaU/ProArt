import type { SkillStatus } from '../../lib/api';

const labels: Record<SkillStatus, string> = {
  not_started: 'Not started', submitted: 'Submitted', under_review: 'Under review',
  verified: 'Verified', rejected: 'Rejected', resubmission_required: 'Resubmission required',
};

export function SkillBadge({ status }: { status: SkillStatus }) {
  return <span className="skill-status" data-status={status}>{labels[status]}</span>;
}

export function SkillDate({ date }: { date: string }) {
  return <time dateTime={date}>{new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(date))}</time>;
}

export function SkillPagination({ offset, limit, has_more, onPage }: {
  offset: number; limit: number; has_more: boolean; onPage: (offset: number) => void;
}) {
  if (!offset && !has_more) return null;
  return <nav className="pagination" aria-label="Skill submissions pagination">
    <button className="button secondary" type="button" disabled={!offset} onClick={() => onPage(Math.max(0, offset - limit))}>Previous</button>
    <button className="button secondary" type="button" disabled={!has_more || offset + limit > 10_000} onClick={() => onPage(offset + limit)}>Next</button>
  </nav>;
}
