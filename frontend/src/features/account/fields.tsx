import type { ReactNode } from 'react';
import { z } from 'zod';

export const phoneField = z.string().trim().min(7, 'Enter a valid phone number.').max(25, 'Enter a valid phone number.')
  .refine(value => {
    if (!/^[+\d\s().-]+$/.test(value)) return false;
    let digits = value.replace(/^(\+|00)?234[\s-]*\(0\)/, '234').replace(/^00/, '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(digits)) digits = '234' + digits.slice(1);
    if (/^2340\d{10}$/.test(digits)) digits = '234' + digits.slice(4);
    return /^[1-9]\d{9,14}$/.test(digits) && (!digits.startsWith('234') || digits.length === 13);
  }, 'Enter a Nigerian or international phone number.');

export function Field({ id, label, error, hint, children }: {
  id: string; label: string; error?: string; hint?: string;
  children: (attributes: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const describedBy = [hint && id + '-hint', error && id + '-error'].filter(Boolean).join(' ');
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    {hint && <p className="field-hint" id={id + '-hint'}>{hint}</p>}
    {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy || undefined })}
    {error && <p className="field-error" id={id + '-error'} role="alert">{error}</p>}
  </div>;
}
