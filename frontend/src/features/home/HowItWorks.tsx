import { Image } from 'lucide-react';
import { HomeImage } from './HomeImage';
import { homeImages } from './images';

const steps = [
  { title: 'Build your profile', description: 'Add your trade, location, experience, and photos of work you’ve completed.' },
  { title: 'Submit evidence', description: 'Send an identity document privately or choose a work sample for review in your dashboard.' },
  { title: 'Share your Trust Card', description: 'Send clients one link. Each approved verification appears separately on the public card.' },
];

export function HowItWorks() {
  const slot = homeImages.howItWorks;
  return (
    <section className="how-section" aria-labelledby="how-title">
      {/* TODO: supply frontend/public/images/home/how-it-works-panorama.webp - wide workshop/trades panoramic strip */}
      <HomeImage
        src={slot.src}
        fallback={slot.fallback}
        alt=""
        className="how-bg"
        loading="lazy"
        decoding="async"
        width={1800}
        height={700}
        sizes="100vw"
        icon={<Image aria-hidden="true" />}
        placeholderClassName="how-bg"
        objectPosition={slot.position}
      />
      <div className="how-overlay" aria-hidden="true" />
      <div className="how-inner">
        <h2 id="how-title">From profile to public proof</h2>
        <p>A simple path from the work you do every day to a Trust Card clients can check for themselves.</p>
        <ol className="how-steps">
          {steps.map((step, index) => (
            <li className="how-step" key={step.title}>
              <span className="how-num" aria-hidden="true">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
