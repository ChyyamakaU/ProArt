import { useRef, useState, type FormEvent } from 'react';
import { Phone } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { ShareActions } from '../../components/ShareActions';
import { Avatar, Feedback, Loading, PortfolioImage } from '../../components/ui';
import {
  ApiError, createProfile, describeApiError, updateProfile, uploadAvatar, uploadSample,
  type NewProfile, type OwnedWorker, type ProfileEdits,
} from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';
import { demoProfilePresentation } from '../../lib/demoProfile';
import { WorkerSkill } from '../verification/WorkerSkill';
import { WorkerIdentity } from '../verification/WorkerIdentity';
import { Field } from './fields';
import { ProfileForm } from './ProfileForm';
import { useSession } from './session';

const acceptedImages = ['image/jpeg', 'image/png', 'image/webp'];
const maximumImageSize = 5 * 1024 * 1024;

export function WorkerArea({ onboarding = false }: { onboarding?: boolean }) {
  const session = useSession();
  usePageMetadata(onboarding ? 'Set up your Trust Card | SkillVerify' : 'Worker dashboard | SkillVerify', 'Manage your SkillVerify worker profile.');
  if (!session.signedIn) return <Navigate to="/login" replace />;
  if (session.error instanceof ApiError && session.error.status === 401) {
    return <div className="shell account-page"><Loading label="Ending session" /></div>;
  }
  if (!session.me) {
    return <div className="shell account-page">
      {session.error ? <Feedback title="Couldn’t load your account" error
        action={<button className="button secondary" onClick={() => void session.refresh().catch(() => undefined)}>Try again</button>}>
        {describeApiError(session.error)}
      </Feedback> : <Loading label="Loading your worker account" />}
    </div>;
  }
  if (session.me.user.role !== 'worker') {
    return <Navigate to="/admin/verification" replace />;
  }
  if (!session.me.worker) return onboarding ? <Onboarding /> : <Navigate to="/onboarding" replace />;
  return onboarding ? <Navigate to="/dashboard" replace /> : <Dashboard key={session.me.worker.slug} worker={session.me.worker} />;
}

function Onboarding() {
  const session = useSession();
  const [error, setError] = useState('');
  const previousWriteUncertain = useRef(false);

  async function publish(values: NewProfile) {
    setError('');
    try {
      // Always recheck the account before a create, including after navigation or a lost response.
      if ((await session.refresh()).worker) return true;
    } catch (failure) {
      setError((previousWriteUncertain.current ? 'We couldn’t confirm whether your Trust Card was published. ' : '') + describeApiError(failure));
      return false;
    }
    try {
      const response = await session.perform((token, signal) => createProfile(values, token, signal));
      session.saveWorker(response.data);
      return true;
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined;
      if (status === 409 || status === 'connection' || status === 'invalid-response' || (typeof status === 'number' && status >= 500)) {
        previousWriteUncertain.current = true;
        try {
          if ((await session.refresh()).worker) return true;
          setError('Your account has no Trust Card yet. Review your details and try publishing again.');
        } catch {
          setError('We couldn’t confirm whether your Trust Card was published. We’ll check your account again before sending another request.');
        }
      } else {
        setError(describeApiError(failure));
      }
      return false;
    }
  }

  return <div className="shell account-page">
    <section className="surface account-panel onboarding-panel">
      <p className="eyebrow">Create your professional identity</p>
      <h1>Set up your Trust Card</h1>
      <p className="account-intro">Add your trade, experience, and contact details to create your professional profile.</p>
      <p className="notice">Submitting this form publishes your Trust Card immediately. Anyone with the link can view it.</p>
      {error && <p className="notice error-notice" role="alert">{error}</p>}
      <ProfileForm onSave={publish} />
    </section>
  </div>;
}

function Dashboard({ worker }: { worker: OwnedWorker }) {
  const session = useSession();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const path = '/workers/' + worker.slug;
  const url = new URL(path, window.location.origin).href;

  async function change(operation: () => Promise<OwnedWorker>, success?: string) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await operation();
      session.saveWorker(updated);
      if (success) setMessage(success);
      try {
        await session.refresh();
      } catch {
        setMessage((success ? success + ' ' : 'Changes were saved. ') + 'The latest profile could not be reloaded.');
      }
      return true;
    } catch (failure) {
      setError(describeApiError(failure));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function saveEdits(edits: ProfileEdits) {
    return change(async () => {
      const response = await session.perform((token, signal) => updateProfile(worker.slug, edits, token, signal));
      return response.data;
    });
  }

  function saveAvatar(image: File) {
    return change(async () => {
      const response = await session.perform((token, signal) => uploadAvatar(worker.slug, image, token, signal));
      return response.worker;
    }, 'Profile photo updated.');
  }

  function saveSample(image: File, caption: string) {
    return change(async () => {
      const response = await session.perform((token, signal) => uploadSample(worker.slug, image, caption, token, signal));
      return { ...worker, work_samples: [response.data, ...worker.work_samples] };
    }, 'Work sample added.');
  }

  return <div className="shell account-page dashboard">
    <section className="surface profile-header worker-dashboard-header">
      <Avatar key={worker.avatar_url} name={worker.full_name} path={worker.avatar_url} />
      <div className="profile-info">
        <p className="eyebrow">Worker dashboard</p>
        {demoProfilePresentation(worker).synthetic && <span className="demo-disclosure">Synthetic demo profile</span>}
        <h1>{worker.full_name}</h1>
        <p className="profile-trade">{worker.trade}</p>
        <p className="profile-meta">{worker.location} · {worker.years_experience} {worker.years_experience === 1 ? 'year' : 'years'} of experience</p>
        <div className="actions">
          <Link className="button primary" to={path}>View public Trust Card</Link>
          <ShareActions title={worker.full_name + ' | SkillVerify Trust Card'} url={url} />
        </div>
      </div>
    </section>
    <dl className="dashboard-overview" aria-label="Public profile at a glance">
      <div><dt>Trust Card</dt><dd>Published</dd></div>
      <div><dt>Portfolio samples</dt><dd>{worker.work_samples.length}</dd></div>
      <div><dt>Client reviews</dt><dd>{worker.review_count}</dd></div>
    </dl>
    <nav className="dashboard-nav" aria-label="Dashboard sections">
      <a className="text-link" href="#verification-heading">Verification</a>
      <a className="text-link" href="#profile-details">Profile details</a>
      <a className="text-link" href="#profile-photo">Profile photo</a>
      <a className="text-link" href="#work-samples">Work samples</a>
      <a className="text-link" href="#skill-verification">Skill Verification</a>
      <a className="text-link" href="#identity-verification">Identity Verification</a>
    </nav>
    <p className="share-feedback" role="status" aria-atomic="true">{message}</p>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="dashboard-grid">
      <section className="surface profile-section" id="profile-details">
        <h2 tabIndex={-1}>Profile details</h2>
        <p className="section-detail">The details you save here appear on your public Trust Card.</p>
        <fieldset disabled={busy}><ProfileForm worker={worker} onSave={saveEdits} /></fieldset>
      </section>
      <section className="surface profile-section" id="profile-photo">
        <h2 tabIndex={-1}>Profile photo</h2>
        <p className="section-detail">Your current public photo appears at the top of the dashboard.</p>
        <ImageForm onSave={saveAvatar} busy={busy} />
      </section>
      <section className="surface profile-section dashboard-wide" id="work-samples">
        <h2 tabIndex={-1}>Work samples</h2>
        {worker.work_samples.length ? <div className="portfolio-grid dashboard-portfolio">{worker.work_samples.map(sample =>
          <figure key={sample.image_url}>
            <PortfolioImage path={sample.image_url} caption={sample.caption} />
            {sample.caption && <figcaption>{sample.caption}</figcaption>}
          </figure>,
        )}</div> : <p className="section-detail">No work samples yet. Add a photo of a completed project.</p>}
        <ImageForm sample onSave={saveSample} busy={busy} />
      </section>
      <section className="dashboard-wide verification-workspace" aria-labelledby="verification-heading">
        <div><h2 id="verification-heading" tabIndex={-1} className="skill-title">Verification</h2>
          <p className="account-intro">Track each check separately. Approved identity and skill outcomes appear on your public Trust Card.</p>
        </div>
        <div className="verification-pillars">
          <section className="surface profile-section contact-pillar">
            <div className="skill-heading"><Phone size={20} aria-hidden="true" /><h2>Contact Verification</h2></div>
            <span className="skill-status">Coming soon</span>
            <p>Confirm that you control your registered phone number when contact verification becomes available.</p>
          </section>
          <WorkerIdentity slug={worker.slug} />
          <WorkerSkill slug={worker.slug} />
        </div>
      </section>
    </div>
  </div>;
}

function ImageForm({ sample = false, busy, onSave }: {
  sample?: boolean; busy: boolean; onSave: (image: File, caption: string) => Promise<boolean>;
}) {
  const [error, setError] = useState<{ field: 'image' | 'caption'; message: string }>();
  const [pending, setPending] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);
  const id = sample ? 'sample-image' : 'avatar-image';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending) return;
    const form = event.currentTarget;
    const image = imageInput.current?.files?.[0];
    const caption = captionInput.current?.value.trim() ?? '';
    setError(undefined);
    const validation = !image?.size ? 'Select an image to upload.'
      : image.size > maximumImageSize ? 'Choose an image that is 5 MiB or smaller.'
      : !acceptedImages.includes(image.type) || !/\.(jpe?g|png|webp)$/i.test(image.name)
        ? 'Choose a JPEG, PNG, or WebP image.' : '';
    if (validation || !image) {
      setError({ field: 'image', message: validation });
      imageInput.current?.focus();
      return;
    }
    if (caption.length > 300) {
      setError({ field: 'caption', message: 'Use 300 characters or fewer.' });
      captionInput.current?.focus();
      return;
    }
    setPending(true);
    try {
      if (await onSave(image, caption)) form.reset();
    } finally {
      setPending(false);
    }
  }

  return <form className="account-form image-form" onSubmit={submit} noValidate>
    <fieldset className="account-form" disabled={busy || pending}>
      <Field id={id} label={sample ? 'Work sample image' : 'New profile photo'} hint="JPEG, PNG, or WebP. Maximum 5 MiB."
        error={error?.field === 'image' ? error.message : undefined}>
        {attributes => <input {...attributes} ref={imageInput} type="file" accept={acceptedImages.join(',')} onChange={() => setError(undefined)} />}
      </Field>
      {sample && <Field id="sample-caption" label="Caption (optional)" error={error?.field === 'caption' ? error.message : undefined}>
        {attributes => <input {...attributes} ref={captionInput} maxLength={300} placeholder="Briefly describe the work" onChange={() => setError(undefined)} />}
      </Field>}
      <button className="button secondary" type="submit">{pending ? 'Uploading…' : (sample ? 'Add work sample' : 'Replace photo')}</button>
    </fieldset>
  </form>;
}
