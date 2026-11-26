import { ArrowRight, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeImage } from './HomeImage';

export function HeroSection() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-media" aria-hidden="true">
        {/* TODO: supply frontend/public/images/home/hero-artisan.webp - artisan at work, right-weighted composition */}
        <HomeImage
          src="/images/home/hero-artisan.webp"
          alt=""
          className="home-hero-img reveal-hero-img"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          width={1600}
          height={1067}
          sizes="100vw"
          icon={<Image aria-hidden="true" />}
          placeholderClassName="home-hero-img"
        />
        <div className="home-hero-scrim" />
      </div>

      <div className="home-hero-inner">
        <div className="home-hero-copy reveal-hero-copy">
          <p className="home-kicker">Verified skills for Nigeria&apos;s artisans</p>
          <h1 id="home-hero-title">Skills you can prove. Trust you can hire.</h1>
          <p className="home-hero-sub">
            ProVart gives skilled workers a public Trust Card with verified identity, reviewed work, and a direct way for clients to get in touch.
          </p>

          <div className="hero-actions">
            <Link className="button primary" to="/workers">
              Explore professionals
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button secondary" to="/register">Get started</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
