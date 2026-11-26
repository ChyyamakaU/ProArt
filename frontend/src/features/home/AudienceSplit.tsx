import { BriefcaseBusiness, Hammer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeImage } from './HomeImage';

export function AudienceSplit() {
  return (
    <section className="audience-split" aria-label="For workers and hirers">
      <article className="audience-panel">
        {/* TODO: supply frontend/public/images/home/for-workers.webp - worker portrait/scene */}
        <HomeImage
          src="/images/home/for-workers.webp"
          alt="A skilled worker in their workshop"
          className="audience-img"
          loading="lazy"
          decoding="async"
          width={1200}
          height={1400}
          sizes="(min-width: 900px) 50vw, 100vw"
          icon={<Hammer aria-hidden="true" />}
          placeholderClassName="audience-img"
        />
        <div className="audience-scrim" aria-hidden="true" />
        <div className="audience-copy">
          <h2>For workers who want their work seen</h2>
          <p>Build a Trust Card that shows your trade, your proof, and the checks you have passed.</p>
          <Link className="audience-link" to="/register">Create your Trust Card</Link>
        </div>
      </article>

      <article className="audience-panel">
        {/* TODO: supply frontend/public/images/home/for-hirers.webp - client/employer scene */}
        <HomeImage
          src="/images/home/for-hirers.webp"
          alt="A client reviewing a professional's work"
          className="audience-img"
          loading="lazy"
          decoding="async"
          width={1200}
          height={1400}
          sizes="(min-width: 900px) 50vw, 100vw"
          icon={<BriefcaseBusiness aria-hidden="true" />}
          placeholderClassName="audience-img"
        />
        <div className="audience-scrim" aria-hidden="true" />
        <div className="audience-copy">
          <h2>For people hiring with confidence</h2>
          <p>See real work, check what has been reviewed, and contact the right professional directly.</p>
          <Link className="audience-link" to="/workers">Find a pro</Link>
        </div>
      </article>
    </section>
  );
}
