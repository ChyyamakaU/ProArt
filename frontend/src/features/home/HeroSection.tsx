import { ArrowRight, ChevronDown, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeImage } from './HomeImage';
import { homeImages } from './images';

type Props = { verifiedPros?: number; proofLoading?: boolean };

export function HeroSection({ verifiedPros = 0, proofLoading = false }: Props) {
  const hero = homeImages.hero;
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-media" aria-hidden="true">
        {/* TODO: supply frontend/public/images/home/hero-artisan.webp - artisan at work, right-weighted composition */}
        <HomeImage
          src={hero.src}
          fallback={hero.fallback}
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
          objectPosition={hero.position}
        />
        <div className="home-hero-scrim" />
      </div>

      <div className="home-hero-inner">
        <div className="home-hero-copy reveal-hero-copy">
          <p className="home-kicker">Verified skills for Nigeria&apos;s artisans</p>
          <h1 id="home-hero-title">
            <span className="hero-line">Skills you can</span>
            <span className="hero-line">prove.</span>
            <span className="hero-line">Trust you can</span>
            <span className="hero-line">hire.</span>
          </h1>
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

          {!proofLoading && verifiedPros > 0 && (
            <p className="hero-proof">
              <span className="hero-proof-value">{verifiedPros.toLocaleString()}</span> verified {verifiedPros === 1 ? 'professional' : 'professionals'} on ProVart
            </p>
          )}
        </div>
      </div>
      <div className="hero-scroll-cue" aria-hidden="true">
        <ChevronDown size={20} />
      </div>
    </section>
  );
}
