import { BadgeCheck, Check, Fingerprint, Phone, Wrench } from 'lucide-react';
import { HomeImage } from './HomeImage';

const rows = [
  {
    id: 'identity',
    title: 'Identity verification',
    description: 'A reviewer checks a privately submitted government-issued document against the identity on the Trust Card. The document stays private, and only the approved outcome appears publicly.',
    icon: Fingerprint,
    image: '/images/home/verify-identity.webp', // TODO: supply frontend/public/images/home/verify-identity.webp
    imageAlt: 'Artisan holding an identity document during verification',
    placeholderIcon: <Fingerprint aria-hidden="true" />,
    live: true,
  },
  {
    id: 'skill',
    title: 'Skill verification',
    description: 'A reviewer examines a portfolio sample as evidence of skill in the professional’s trade. Approved work gives clients something real to inspect before they make contact.',
    icon: BadgeCheck,
    image: '/images/home/verify-skill.webp', // TODO: supply frontend/public/images/home/verify-skill.webp
    imageAlt: 'Close-up of hands doing skilled trade work',
    placeholderIcon: <Wrench aria-hidden="true" />,
    live: true,
  },
  {
    id: 'contact',
    title: 'Contact verification',
    description: 'Confirms the professional controls their registered phone number. When this check is live, clients will know the number on the profile belongs to the worker.',
    icon: Phone,
    image: '/images/home/verify-contact.webp', // TODO: supply frontend/public/images/home/verify-contact.webp
    imageAlt: 'Worker holding a phone while managing client messages',
    placeholderIcon: <Phone aria-hidden="true" />,
    live: false,
  },
];

export function VerificationStory() {
  return (
    <section className="story-section" id="verification" aria-labelledby="verification-title">
      <div className="story-header">
        <h2 id="verification-title" tabIndex={-1}>Three checks, three clear outcomes</h2>
        <p>Each verification answers a different question. ProVart shows what was reviewed, what was approved, and what is still to come.</p>
      </div>

      {rows.map((row, index) => {
        const Icon = row.icon;
        const reversed = index % 2 === 1;
        return (
          <article className={`story-row ${reversed ? 'is-reversed' : ''}`} key={row.id}>
            <div className="story-media">
              <HomeImage
                src={row.image}
                alt={row.imageAlt}
                className="story-img"
                loading="lazy"
                decoding="async"
                width={1200}
                height={900}
                sizes="(min-width: 900px) 50vw, 100vw"
                icon={row.placeholderIcon}
              />
            </div>
            <div className="story-copy">
              <span className="story-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
              <h3>{row.title}</h3>
              <p>{row.description}</p>
              <p className={`story-status ${row.live ? 'is-live' : ''}`}>
                {row.live ? <><Check size={16} strokeWidth={2.4} aria-hidden="true" /> Reviewed verification</> : 'Coming soon'}
              </p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
