import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, BriefcaseBusiness, Building2, Camera, Fingerprint, IdCard, MapPin, Phone, ShieldCheck, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WorkerCard } from '../../components/WorkerCard';
import { Brand, Feedback, Loading } from '../../components/ui';
import { describeApiError, listWorkers } from '../../lib/api';
import { trades } from '../../lib/trades';

const emptyFilters = { q: '', trade: '', location: '' };

const tiers = [
  { title: 'Contact Verification', description: 'Confirms that a professional controls their registered phone number.', icon: Phone, availability: 'Coming soon' },
  { title: 'Identity Verification', description: 'A reviewer checks a privately submitted government-issued document against the professional identity on the Trust Card.', icon: Fingerprint, availability: 'Available' },
  { title: 'Skill Verification', description: 'A reviewer examines a portfolio sample as evidence of skill in the professional’s trade.', icon: BadgeCheck, availability: 'Available' },
];

const steps = [
  { title: 'Build your profile', description: 'Add your trade, location, experience and photos of work you’ve completed.' },
  { title: 'Submit evidence', description: 'Send an identity document privately or choose a work sample for review in your dashboard.' },
  { title: 'Share your Trust Card', description: 'Send clients one link. Each approved verification appears separately on the public card.' },
];

const benefits = [
  { title: 'Skilled professionals', description: 'Carry a public record of your work from one job to the next, even when a customer has never met you.', icon: BriefcaseBusiness },
  { title: 'Customers', description: 'See the work, read client reviews and check which claims have been reviewed before making contact.', icon: UsersRound },
  { title: 'Businesses', description: 'Shortlist technicians and independent tradespeople by trade and location, with evidence you can inspect.', icon: Building2 },
];

export function Home() {
  const profiles = useQuery({
    queryKey: ['workers', emptyFilters, 0],
    queryFn: ({ signal }) => listWorkers(emptyFilters, 0, signal),
  });
  const workers = profiles.data?.data.slice(0, 3) ?? [];

  return <div className="marketing">
    <section className="hero-band">
      <div className="shell editorial-hero">
        <div className="hero-content">
          <p className="eyebrow brand-position"><span aria-hidden="true" />Nigeria’s number one platform for verified skills and professional identity.</p>
          <h1>Skills you can prove.<br /><em>Trust you can build.</em></h1>
          <p className="hero-description">Provart helps skilled professionals establish credible digital identities, showcase their work and demonstrate verified skills — giving customers and businesses greater confidence in the people they hire.</p>
          <div className="actions">
            <Link className="button primary" to="/workers">Explore professionals</Link>
            <Link className="button secondary" to="/register">Create your Trust Card</Link>
          </div>
        </div>
        <figure className="hero-figure">
          <img src="/images/technician.jpg" alt="Illustrative portrait of a technician in a Nigerian workshop" width="1120" height="747" fetchPriority="high" />
          <figcaption><ShieldCheck size={21} aria-hidden="true" /><span>Professional identity for skilled work</span></figcaption>
        </figure>
      </div>
    </section>

    <section className="shell editorial-section problem-section" aria-labelledby="credibility-title">
      <div><p className="eyebrow">The credibility gap</p><h2 id="credibility-title">Good work should speak beyond a referral.</h2></div>
      <div className="editorial-copy">
        <p>In Nigeria, a recommendation from a neighbour or a WhatsApp exchange can start the conversation. When a customer is hiring outside their network, it can be hard to see the quality of someone’s past work or know which claims have been checked.</p>
        <p>For skilled professionals, that often means starting from scratch each time they meet a new client.</p>
      </div>
    </section>

    <section className="editorial-band" aria-labelledby="solution-title">
      <div className="shell editorial-section solution-section">
        <img src="/images/tailoring-studio.jpg" alt="Illustrative scene of a tailor sewing fabric in a Nigerian studio" width="1200" height="800" loading="lazy" />
        <div className="editorial-copy">
          <p className="eyebrow">The Provart Trust Card</p>
          <h2 id="solution-title">One link for the work you stand behind.</h2>
          <p>Bring your trade, experience, portfolio and client reviews together in a shareable professional profile. Customers can see the evidence for themselves and understand exactly which checks have been approved.</p>
          <a className="text-link" href="#verification">See how verification works</a>
        </div>
      </div>
    </section>

    <section className="shell editorial-section verification-story" id="verification" aria-labelledby="verification-title">
      <div className="section-heading"><p className="eyebrow">Verification</p>
        <h2 id="verification-title" tabIndex={-1}>Three checks. Three distinct outcomes.</h2>
        <p>Identity and skill are reviewed separately. Each approval tells a customer something specific about the professional.</p>
      </div>
      <div className="tier-grid">{tiers.map(({ title, description, icon: Icon, availability }) =>
        <article className="surface tier" key={title}>
          <div className="tier-head"><span className="icon-tile"><Icon size={23} aria-hidden="true" /></span>
            <span className="skill-status" data-status={availability === 'Available' ? 'available' : undefined}>{availability}</span></div>
          <h3>{title}</h3><p>{description}</p>
        </article>
      )}</div>
      <div className="process-block">
        <h3>From profile to public proof</h3>
        <ol className="process-grid">{steps.map((step, index) => <li key={step.title}>
          <span className="process-index" aria-hidden="true">{index + 1}</span>
          <div><h4>{step.title}</h4><p>{step.description}</p></div>
        </li>)}</ol>
      </div>
    </section>

    <section className="editorial-band" aria-labelledby="professionals-title">
      <div className="shell editorial-section">
        <div className="section-heading section-split"><div><p className="eyebrow">Public directory</p>
          <h2 id="professionals-title">Explore professional profiles.</h2>
          <p>Browse published Trust Cards and see the work behind each profile.</p></div>
          <Link className="button secondary" to="/workers">View the full directory</Link>
        </div>
        {profiles.isPending && <Loading label="Loading published profiles" cards={3} />}
        {profiles.isError && <Feedback title="Couldn’t load professional profiles" error
          action={<button type="button" className="button secondary" onClick={() => void profiles.refetch()}>Try again</button>}>
          {describeApiError(profiles.error)}
        </Feedback>}
        {!!workers.length && !profiles.isError && <div className="results-grid home-profiles">
          {workers.map(worker => <WorkerCard key={worker.slug} worker={worker} />)}
        </div>}
        {profiles.isSuccess && !workers.length && <Feedback title="No public profiles available">Published Trust Cards will appear here when professionals join.</Feedback>}
        <nav className="trade-discovery" aria-label="Browse by trade">
          <h3>Browse by trade</h3>
          <ul>{trades.map(({ name, query }) => <li key={name}><Link to={'/workers?' + new URLSearchParams({ trade: query })}>{name}</Link></li>)}</ul>
        </nav>
      </div>
    </section>

    <section className="shell editorial-section credential-story" aria-labelledby="example-title">
      <div className="editorial-copy">
        <p className="eyebrow">Inside a Trust Card</p>
        <h2 id="example-title">A credential people can explore.</h2>
        <p>Start with the person and their trade, then look through their portfolio, reviews and public contact options. Identity documents and review feedback stay private.</p>
        {workers[0] && !profiles.isError && <Link className="button primary" to={'/workers/' + workers[0].slug}>Open a published Trust Card</Link>}
      </div>
      <figure className="credential-example">
        <figcaption><Brand /><span>Illustrative layout</span></figcaption>
        <div className="example-body"><div className="example-identity"><span className="icon-tile"><IdCard size={27} aria-hidden="true" /></span>
          <div><strong>Professional identity</strong><p>Name and trade</p></div></div>
          <ul>
            <li><MapPin size={18} aria-hidden="true" />Location and experience</li>
            <li><Camera size={18} aria-hidden="true" />Work portfolio and client reviews</li>
            <li><ShieldCheck size={18} aria-hidden="true" />Approved outcomes, when available</li>
          </ul>
        </div>
      </figure>
    </section>

    <section className="editorial-band" aria-labelledby="benefits-title"><div className="shell editorial-section">
      <div className="section-heading"><h2 id="benefits-title">Useful on both sides of the job.</h2></div>
      <div className="benefit-grid">{benefits.map(({ title, description, icon: Icon }) => <article key={title}>
        <Icon size={25} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>
      </article>)}</div>
    </div></section>

    <section className="vision-section" aria-labelledby="vision-title"><div className="shell editorial-section">
      <p className="eyebrow">Our vision</p><h2 id="vision-title">Make credible skilled work easier to find across Nigeria.</h2>
      <p>We’re building a professional identity workers can carry from job to job and city to city, so a reputation earned through good work can travel with them.</p>
      <div className="actions"><Link className="button primary" to="/register">Create your Trust Card</Link>
        <Link className="button secondary" to="/workers">Discover professionals</Link></div>
    </div></section>
  </div>;
}
