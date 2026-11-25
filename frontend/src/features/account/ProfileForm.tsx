import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { trades } from '../../lib/trades';
import type { NewProfile, OwnedWorker, ProfileEdits } from '../../lib/api';
import { Field, phoneField } from './fields';

const fields = {
  location: z.string().trim().min(2, 'Enter a location.').max(120),
  bio: z.string().trim().max(1000, 'Use 1,000 characters or fewer.'),
  years_experience: z.number({ error: 'Enter years of experience from 0 to 70.' }).int().min(0).max(70),
  instagram_handle: z.string().trim().max(80).refine(
    value => value === '' || /^[a-zA-Z0-9._]{1,79}$/.test(value.replace(/^@+/, '')),
    'Use letters, numbers, periods or underscores.',
  ),
};
const editSchema = z.object({
  ...fields, phone: z.literal('').or(phoneField), full_name: z.string(), trade: z.string(),
});
const createSchema = z.object({
  ...fields,
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  trade: z.string().trim().min(2, 'Enter your trade.').max(80),
  phone: phoneField,
});
type FormValues = z.input<typeof createSchema>;
type ProfileFormProps =
  | { worker?: undefined; onSave: (values: NewProfile) => Promise<boolean> }
  | { worker: OwnedWorker; onSave: (values: ProfileEdits) => Promise<boolean> };

export function ProfileForm(props: ProfileFormProps) {
  const worker = props.worker;
  const pending = useRef(false);
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(worker ? editSchema : createSchema),
    defaultValues: {
      full_name: worker?.full_name ?? '', trade: worker?.trade ?? '', location: worker?.location ?? '',
      phone: '', bio: worker?.bio ?? '', years_experience: worker?.years_experience ?? 0,
      instagram_handle: worker?.instagram_handle ?? '',
    },
  });

  async function submit(values: FormValues) {
    if (pending.current) return;
    pending.current = true;
    setSaved(false);
    const { full_name, trade, phone, instagram_handle, ...basic } = values;
    const edits = { ...basic, instagram_handle: instagram_handle || null };
    try {
      if (props.worker) {
        if (await props.onSave({ ...edits, ...(phone ? { phone } : {}) })) {
          reset({ ...values, full_name: props.worker.full_name, trade: props.worker.trade, phone: '' });
          setSaved(true);
        }
      } else {
        await props.onSave({ ...edits, full_name, trade, phone });
      }
    } finally {
      pending.current = false;
    }
  }

  return <form className="account-form profile-form" onSubmit={handleSubmit(submit)} noValidate>
    <fieldset disabled={isSubmitting} className="profile-fields">
      {!worker && <>
        <Field id="profile-name" label="Full name" error={errors.full_name?.message}>
          {attributes => <input {...attributes} {...register('full_name')} autoComplete="name" maxLength={120} />}
        </Field>
        <Field id="profile-trade" label="Trade" hint="Choose a suggestion or enter your trade." error={errors.trade?.message}>
          {attributes => <input {...attributes} {...register('trade')} list="onboarding-trades" maxLength={80} />}
        </Field>
        <datalist id="onboarding-trades">{trades.map(trade => <option key={trade.name} value={trade.name} />)}</datalist>
      </>}
      <Field id="profile-location" label="Location" hint="Use a town or area, such as Wuse, Abuja." error={errors.location?.message}>
        {attributes => <input {...attributes} {...register('location')} maxLength={120} />}
      </Field>
      <Field id="profile-phone" label={worker ? 'Replace contact number (optional)' : 'Profile contact number'}
        hint={worker ? 'Leave blank to keep the current number. A new number may be visible through your WhatsApp link.'
          : 'This number may be visible through your public WhatsApp contact link.'} error={errors.phone?.message}>
        {attributes => <input {...attributes} {...register('phone')} type="tel" maxLength={25} placeholder="e.g. 0803 123 4567" />}
      </Field>
      <Field id="profile-experience" label="Years of experience" error={errors.years_experience?.message}>
        {attributes => <input {...attributes} {...register('years_experience', { valueAsNumber: true })} type="number" min={0} max={70} step={1} />}
      </Field>
      <Field id="profile-instagram" label="Instagram handle (optional)" error={errors.instagram_handle?.message}>
        {attributes => <input {...attributes} {...register('instagram_handle')} placeholder="@yourhandle" maxLength={80} />}
      </Field>
      <div className="form-wide">
        <Field id="profile-bio" label="Bio" hint="Describe your work or specialties in up to 1,000 characters." error={errors.bio?.message}>
          {attributes => <textarea {...attributes} {...register('bio')} rows={4} maxLength={1000} />}
        </Field>
      </div>
    </fieldset>
    <div className="form-actions">
      <button className="button primary" disabled={isSubmitting || (Boolean(worker) && !isDirty)} type="submit">
        {isSubmitting ? (worker ? 'Saving…' : 'Publishing…') : (worker ? 'Save changes' : 'Publish Trust Card')}
      </button>
      <span className="share-feedback" role="status" aria-atomic="true">{saved && !isDirty ? 'Profile changes saved.' : ''}</span>
    </div>
  </form>;
}
