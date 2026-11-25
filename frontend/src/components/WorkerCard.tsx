import { BriefcaseBusiness, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Worker } from '../lib/api';
import { demoProfilePresentation } from '../lib/demoProfile';
import { Avatar } from './ui';

export function WorkerCard({ worker, directorySearch }: { worker: Worker; directorySearch?: string }) {
  const { synthetic, bio } = demoProfilePresentation(worker);
  return <article className="surface worker-card">
    <div className="worker-heading">
      <Avatar key={worker.avatar_url} name={worker.full_name} path={worker.avatar_url} />
      <div className="worker-name"><h3>{worker.full_name}</h3><p>{worker.trade}</p></div>
    </div>
    <div className="worker-facts">
      <span className="meta"><MapPin size={16} aria-hidden="true" />{worker.location}</span>
      {worker.years_experience > 0 && <span className="meta"><BriefcaseBusiness size={16} aria-hidden="true" />
        {worker.years_experience} {worker.years_experience === 1 ? 'year' : 'years'} of experience
      </span>}
    </div>
    {bio && <p className="worker-bio">{bio}</p>}
    {synthetic && <span className="demo-disclosure">Synthetic demo profile</span>}
    <div className="worker-bottom">
      <span className="meta">{worker.avg_rating === null ? 'No reviews yet' : <><Star size={16} aria-hidden="true" />{worker.avg_rating.toFixed(1)} ({worker.review_count})</>}</span>
      <Link className="text-link" to={'/workers/' + worker.slug} state={directorySearch ? { directorySearch } : undefined}
        aria-label={'View Trust Card for ' + worker.full_name}>View Trust Card</Link>
    </div>
  </article>;
}
