import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HomeImage } from './HomeImage';

export function HeroSection() {
  const navigate = useNavigate();
  const [trade, setTrade] = useState('');
  const [location, setLocation] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (trade.trim()) params.set('trade', trade.trim());
    if (location.trim()) params.set('location', location.trim());
    const query = params.toString();
    void navigate(query ? `/workers?${query}` : '/workers');
  }

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
          label="Add hero-artisan.webp"
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

          <form className="hero-search" role="search" aria-label="Find professionals" onSubmit={onSubmit}>
            <div className="hero-search-field">
              <label htmlFor="hero-trade">Service</label>
              <input id="hero-trade" name="trade" type="search" placeholder="Electrician, tailor..." value={trade} onChange={(e) => setTrade(e.target.value)} autoComplete="off" />
            </div>
            <div className="hero-search-field">
              <label htmlFor="hero-location">Location</label>
              <input id="hero-location" name="location" type="search" placeholder="Lagos, Abuja..." value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="off" />
            </div>
            <button type="submit" className="hero-search-submit">Find pros</button>
          </form>

          <div className="hero-links">
            <Link className="hero-text-link" to="/workers">Browse verified pros</Link>
            <Link className="hero-text-link hero-text-link-muted" to="/register">I&apos;m a worker: create my free Trust Card</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
