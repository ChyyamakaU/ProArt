import { Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeImage } from './HomeImage';

export function FinalCta() {
  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      {/* TODO: supply frontend/public/images/home/final-cta.webp - closing artisan photo */}
      <HomeImage
        src="/images/home/final-cta.webp"
        alt=""
        className="final-cta-img"
        loading="lazy"
        decoding="async"
        width={1600}
        height={900}
        sizes="100vw"
        icon={<Image aria-hidden="true" />}
        placeholderClassName="final-cta-img"
      />
      <div className="final-cta-scrim" aria-hidden="true" />
      <div className="final-cta-inner">
        <h2 id="final-cta-title">Good work deserves to be trusted.</h2>
        <p>Create a ProVart Trust Card and give clients a clear way to see your skill, your checks, and how to reach you.</p>
        <Link className="button primary" to="/register">Create your Trust Card</Link>
      </div>
    </section>
  );
}
