import { BadgeCheck, MessageCircle, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { contactLink, mediaUrl, type Worker } from '../../lib/api';
import { HomeImage } from './HomeImage';
import { homeImages } from './images';

const portraitSlots = [homeImages.workerPortrait1, homeImages.workerPortrait2, homeImages.workerPortrait3];

function workerPhoto(worker: Worker, index: number) {
  const slot = portraitSlots[index % portraitSlots.length];
  const real = mediaUrl(worker.avatar_url) ?? mediaUrl(worker.work_samples[0]?.image_url ?? null);
  return {
    src: real ?? slot.src,
    fallback: slot.fallback,
    position: slot.position,
  };
}

export function VerifiedPros({ workers }: { workers: Worker[] }) {
  return (
    <section className="pros-section" aria-labelledby="verified-pros-title">
      <div className="pros-header">
        <div>
          <h2 id="verified-pros-title">Verified pros, real work</h2>
          <p>Browse public Trust Cards from skilled professionals and reach out directly when you see the right fit.</p>
        </div>
        <Link className="pros-link" to="/workers">See all professionals</Link>
      </div>

      {workers.length ? (
        <div className="pros-track" aria-label="Verified professionals">
          {workers.map((worker, index) => {
            const verified = Boolean(worker.approved_verifications?.identity || worker.approved_verifications?.skill);
            const wa = contactLink(worker.whatsapp_links.hire_url);
            const photo = workerPhoto(worker, index);
            // TODO: supply frontend/public/images/home/worker-portrait-1.webp, worker-portrait-2.webp, worker-portrait-3.webp
            return (
              <article className="pro-tile" key={worker.slug}>
                <HomeImage
                  src={photo.src}
                  fallback={photo.fallback}
                  alt={`${worker.full_name}, ${worker.trade} in ${worker.location}`}
                  className="pro-tile-img"
                  loading="lazy"
                  decoding="async"
                  width={720}
                  height={960}
                  sizes="(min-width: 1024px) 33vw, 320px"
                  icon={<UserRound aria-hidden="true" />}
                  objectPosition={photo.position}
                />
                <div className="pro-tile-scrim" aria-hidden="true" />
                <div className="pro-tile-body">
                  {verified && <p className="pro-tile-verified"><BadgeCheck aria-hidden="true" /> Verified</p>}
                  <h3 className="pro-tile-name">
                    <Link to={`/workers/${worker.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {worker.full_name}
                    </Link>
                  </h3>
                  <p className="pro-tile-meta">{worker.trade} · {worker.location}</p>
                  {wa && (
                    <a className="pro-tile-wa" href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={16} aria-hidden="true" /> Chat on WhatsApp
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="pros-empty">The first verified professionals are building their Trust Cards now. If you do skilled work, you can be one of them.</p>
      )}
    </section>
  );
}
