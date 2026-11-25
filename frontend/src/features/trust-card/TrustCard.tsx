import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, IdCard, MapPin, MessageCircle, ShieldCheck, Star } from 'lucide-react';
import { ShareActions } from '../../components/ShareActions';
import { PortfolioGallery } from '../../components/PortfolioGallery';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Avatar, Feedback, Loading } from '../../components/ui';
import { demoProfilePresentation } from '../../lib/demoProfile';
import { ApiError, contactLink, describeApiError, getWorker, mediaUrl } from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';

export function TrustCard() {
  const { slug = '' } = useParams();
  const directorySearch = useLocation().state?.directorySearch;
  const returnSearch = typeof directorySearch === 'string' && directorySearch.startsWith('?') ? directorySearch : '';
  const validSlug = slug.length >= 3 && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const query = useQuery({
    queryKey: ['worker', slug], queryFn: ({ signal }) => getWorker(slug, signal), enabled: validSlug,
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const worker = query.data?.data;
  const missing = !validSlug || (query.error instanceof ApiError && query.error.status === 404);
  const presentation = worker && demoProfilePresentation(worker);
  const contact = worker && !presentation?.synthetic && contactLink(worker.whatsapp_links.hire_url);
  const publicUrl = worker ? new URL('/workers/' + worker.slug, window.location.origin).href : undefined;
  const description = worker
    ? `View ${worker.full_name}’s public Trust Card for ${worker.trade} in ${worker.location}, including available work samples and client reviews.`
    : 'View a public ProArt Trust Card.';
  usePageMetadata(
    worker ? `${worker.full_name} · ${worker.trade} | ProArt` : (missing ? 'Trust Card not found | ProArt' : 'Trust Card | ProArt'),
    description,
    publicUrl ? { url: publicUrl, image: mediaUrl(worker?.avatar_url ?? null) } : undefined,
  );

  return <div className="shell profile-page">
    <Link className="text-link back-link" to={{ pathname: '/workers', search: returnSearch }}>
      <ArrowLeft size={17} aria-hidden="true" />{returnSearch ? 'Back to search results' : 'Worker directory'}
    </Link>
    {missing ? <Feedback title="Trust Card not found">Check the link or return to the worker directory.</Feedback>
      : query.isPending ? <Loading label="Loading Trust Card" />
      : query.isError ? <Feedback error title="Couldn’t load this Trust Card"
          action={<button className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
          {describeApiError(query.error)}
        </Feedback>
      : worker && <>
        <section className="credential-header">
          <div className="credential-label"><IdCard size={21} aria-hidden="true" /><span>ProArt Trust Card</span>
            {presentation?.synthetic && <span className="demo-disclosure">Synthetic demo profile</span>}
          </div>
          <div className="credential-identity">
            <Avatar key={worker.avatar_url} name={worker.full_name} path={worker.avatar_url} />
            <div className="profile-info">
            <h1>{worker.full_name}</h1>
            <p className="profile-trade">{worker.trade}</p>
            {(worker.approved_verifications?.identity || worker.approved_verifications?.skill) && <ul className="public-verifications" aria-label="Approved verifications">
              {worker.approved_verifications.identity && <li><ShieldCheck size={17} aria-hidden="true" />Identity Verified</li>}
              {worker.approved_verifications.skill && <li><BadgeCheck size={17} aria-hidden="true" />Skill Verified</li>}
            </ul>}
            </div>
          </div>
          <dl className="credential-facts">
            <div><dt><MapPin size={17} aria-hidden="true" />Location</dt><dd>{worker.location}</dd></div>
            {worker.years_experience > 0 && <div><dt><BriefcaseBusiness size={17} aria-hidden="true" />Experience</dt><dd>{worker.years_experience} {worker.years_experience === 1 ? 'year' : 'years'}</dd></div>}
            {worker.avg_rating !== null && <div><dt><Star size={17} aria-hidden="true" />Client rating</dt><dd>{worker.avg_rating.toFixed(1)} out of 5</dd></div>}
          </dl>
        </section>
        <div className="credential-content">
        <aside className="surface profile-section credential-contact" aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact and share</h2>
          <p>{presentation?.synthetic ? 'Contact is disabled for this fictional profile.' : contact
            ? 'Reach this professional through their public WhatsApp contact.' : 'This professional has no public WhatsApp contact available.'}</p>
          <div className="credential-actions">
            {contact && <a className="button primary" href={contact} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> Contact on WhatsApp</a>}
            {publicUrl && <ShareActions key={worker.slug} url={publicUrl} title={worker.full_name + ' | ProArt Trust Card'} />}
          </div>
        </aside>
        <div className="profile-sections">
          {presentation?.bio && <section className="surface profile-section"><h2>Professional summary</h2><p className="preserve-lines">{presentation.bio}</p></section>}
          <section className="surface profile-section">
            <h2>Work portfolio</h2>
            {worker.work_samples.length ? <PortfolioGallery samples={worker.work_samples} /> : <p>No work samples have been added yet.</p>}
          </section>
          <section className="surface profile-section">
            <h2>Client reviews {worker.review_count > 0 && <span className="count">({worker.review_count})</span>}</h2>
            {worker.reviews.length ? <ul className="review-list">{worker.reviews.map((review, index) =>
              <li key={review.created_at + '-' + index}>
                <div><strong>{review.client_name}</strong><span className="meta"><Star size={16} aria-hidden="true" />{review.rating} out of 5</span></div>
                {review.job_description && <p className="review-job">{review.job_description}</p>}
                {review.comment && <p className="preserve-lines">{review.comment}</p>}
              </li>
            )}</ul> : <p>No client reviews have been posted yet.</p>}
          </section>
        </div>
        </div>
      </>}
  </div>;
}
