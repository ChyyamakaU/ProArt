import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, IdCard, Images, ShieldCheck } from 'lucide-react';
import { PasswordInput } from '../../components/ui';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { z } from 'zod';
import { authenticate, describeApiError, type Credentials } from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';
import { Field, phoneField } from './fields';
import { useSession } from './session';

const loginSchema = z.object({ phone: phoneField, password: z.string().min(1, 'Enter your password.').max(128) });
const registerSchema = loginSchema.extend({
  password: z.string().min(8, 'Use at least 8 characters.').max(128)
    .refine(password => new TextEncoder().encode(password).length <= 72, 'Use a password of at most 72 UTF-8 bytes.'),
});

export function Auth({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession();
  const controller = useRef<AbortController | undefined>(undefined);
  const [error, setError] = useState<unknown>();
  const joining = mode === 'register';
  const heading = joining ? 'Create your worker account' : 'Sign in';
  usePageMetadata(heading + ' | ProVart', 'Access your ProVart worker account and manage your public Trust Card.');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Credentials>({
    resolver: zodResolver(joining ? registerSchema : loginSchema),
  });

  useEffect(() => () => controller.current?.abort(), []);
  if (session.signedIn) return <Navigate to="/dashboard" replace />;

  async function submit(values: Credentials) {
    if (controller.current) return;
    const pending = new AbortController();
    controller.current = pending;
    setError(undefined);
    try {
      const result = await authenticate(mode, values, pending.signal);
      if (!pending.signal.aborted) session.start(result.token);
    } catch (failure) {
      if (!pending.signal.aborted) setError(failure);
    } finally {
      if (controller.current === pending) controller.current = undefined;
    }
  }

  return <div className="shell account-page auth-layout">
    <aside className="auth-story" aria-label="About ProVart">
      <Link className="auth-back-home" to="/"><ArrowLeft size={18} aria-hidden="true" /> Back to home</Link>
      <div><p className="eyebrow">For skilled professionals</p>
        <p className="auth-story-headline">Your work deserves a professional identity.</p>
        <p>Give the next customer one place to see who you are, what you do, and which checks you’ve completed.</p></div>
      <ul>
        <li><IdCard size={21} aria-hidden="true" /> A public Trust Card you can share</li>
        <li><Images size={21} aria-hidden="true" /> A portfolio of your own work</li>
        <li><ShieldCheck size={21} aria-hidden="true" /> Separate Identity and Skill Verification</li>
      </ul>
    </aside>
    <section className="surface account-panel">
      <Link className="auth-back-home-mobile" to="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
      <p className="eyebrow">ProVart account</p>
      <h1>{heading}</h1>
      <p className="account-intro">{joining ? 'Create an account to set up your public ProVart Trust Card.' : 'Use the phone number and password for your worker account.'}</p>
      {session.expired && <p className="notice" role="status">Your session ended. Sign in again to continue.</p>}
      <form className="account-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field id="account-phone" label="Phone number" error={errors.phone?.message}>
          {props => <input {...props} {...register('phone')} type="tel" autoComplete="username" maxLength={25} placeholder="e.g. 0803 123 4567" />}
        </Field>
        <Field id="account-password" label="Password" hint={joining ? 'Use at least 8 characters.' : undefined} error={errors.password?.message}>
          {props => <PasswordInput {...props} {...register('password')} autoComplete={joining ? 'new-password' : 'current-password'} maxLength={128} />}
        </Field>
        {Boolean(error) && <p className="notice error-notice" role="alert">{describeApiError(error)}</p>}
        <button className="button primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? (joining ? 'Creating account…' : 'Signing in…') : heading}
        </button>
      </form>
      <p className="account-switch">{joining ? 'Already have an account?' : 'New to ProVart?'}{' '}
        <Link className="text-link" to={joining ? '/login' : '/register'}>
          {joining ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </section>
  </div>;
}
