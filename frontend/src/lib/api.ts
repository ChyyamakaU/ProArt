import { z } from 'zod';

const sampleSchema = z.object({
  image_url: z.string(),
  caption: z.string(),
  created_at: z.string(),
});
const reviewSchema = z.object({
  client_name: z.string(),
  job_description: z.string().nullable(),
  rating: z.number(),
  comment: z.string(),
  created_at: z.string(),
});

// Select the public fields this UI uses. Legacy verification fields are discarded.
const workerSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  full_name: z.string(),
  trade: z.string(),
  location: z.string(),
  bio: z.string(),
  years_experience: z.number(),
  avatar_url: z.string().nullable(),
  avg_rating: z.number().nullable(),
  review_count: z.number(),
  work_samples: z.array(sampleSchema),
  reviews: z.array(reviewSchema),
  whatsapp_links: z.object({ hire_url: z.string() }),
  approved_verifications: z.object({ identity: z.literal(true).optional(), skill: z.literal(true).optional() }).optional(),
});
const listSchema = z.object({
  data: z.array(workerSchema),
  pagination: z.object({
    total: z.number(), limit: z.number().positive(), offset: z.number(), has_more: z.boolean(),
  }),
});
const detailSchema = z.object({ data: workerSchema });
const filtersSchema = z.object({ trades: z.array(z.string()), locations: z.array(z.string()) });
const skillStatusSchema = z.enum(['submitted', 'under_review', 'verified', 'rejected', 'resubmission_required']);
const skillSampleSchema = sampleSchema.pick({ image_url: true, caption: true }).extend({ id: z.uuid() });
const skillSubmissionSchema = z.object({
  id: z.uuid(), trade: z.string(), status: skillStatusSchema,
  submitted_at: z.string(), review_started_at: z.string().nullable(), decided_at: z.string().nullable(),
  reason: z.string().nullable(), sample: skillSampleSchema,
});
const skillPagination = z.object({ limit: z.number(), offset: z.number(), has_more: z.boolean() });
const skillWorkerSchema = z.object({
  status: z.union([skillStatusSchema, z.literal('not_started')]),
  current: skillSubmissionSchema.nullable(), history: z.array(skillSubmissionSchema),
  samples: z.array(skillSampleSchema), pagination: skillPagination,
});
const skillQueueSchema = z.object({
  data: z.array(skillSubmissionSchema.extend({
    worker: z.object({ slug: z.string(), full_name: z.string() }), can_review: z.boolean(),
  })),
  pagination: skillPagination,
});
const skillResultSchema = z.object({ data: skillSubmissionSchema });
const identityDocumentType = z.enum(['national_id', 'passport', 'drivers_license', 'voter_card']);
const identitySubmissionSchema = skillSubmissionSchema.omit({ trade: true, sample: true }).extend({
  document_type: identityDocumentType,
});
const identityStatusSchema = skillWorkerSchema.omit({ samples: true }).extend({
  available: z.boolean(), current: identitySubmissionSchema.nullable(), history: z.array(identitySubmissionSchema),
});
const identityQueueSchema = z.object({
  data: z.array(identitySubmissionSchema.extend({
    full_name: z.string(), can_review: z.boolean(), can_view_document: z.boolean(),
  })),
  pagination: skillPagination,
});
const identityResultSchema = z.object({ data: identitySubmissionSchema });
const accountSchema = z.object({ id: z.number(), phone: z.string(), role: z.enum(['worker', 'admin']) });
const sessionSchema = z.object({ token: z.string().min(1), user: accountSchema });
const ownedWorkerSchema = workerSchema.extend({ instagram_handle: z.string().nullable() });
const ownedDetailSchema = z.object({ data: ownedWorkerSchema });
const meSchema = z.object({
  user: accountSchema.extend({ created_at: z.string() }),
  worker: ownedWorkerSchema.nullable(),
});

export type Worker = z.infer<typeof workerSchema>;
export type OwnedWorker = z.infer<typeof ownedWorkerSchema>;
export type WorkerSession = z.infer<typeof meSchema>;
export type Credentials = { phone: string; password: string };
export type ProfileEdits = {
  location: string;
  phone?: string;
  bio: string;
  years_experience: number;
  instagram_handle: string | null;
};
export type NewProfile = ProfileEdits & { full_name: string; trade: string; phone: string };
export type WorkerList = z.infer<typeof listSchema>;
export type WorkerFilters = { q: string; trade: string; location: string };
export type SkillStatus = z.infer<typeof skillWorkerSchema>['status'];
export type SkillSubmission = z.infer<typeof skillSubmissionSchema>;
export type SkillQueueFilter = 'active' | 'verified' | 'rejected' | 'resubmission_required';
export type SkillReview = { status: 'under_review' | 'verified' } | { status: 'rejected' | 'resubmission_required'; reason: string };
export type IdentityDocumentType = z.infer<typeof identityDocumentType>;
export const searchSchema = z.object({
  q: z.string().trim().max(100),
  trade: z.string().trim().max(80),
  location: z.string().trim().max(120),
});

const baseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public readonly status: number | 'connection' | 'invalid-response', public readonly code?: string) {
    super('The request could not be completed.');
    this.name = 'ApiError';
  }
}

type RequestOptions = { signal?: AbortSignal; token?: string; method?: 'POST' | 'PATCH'; body?: object };

async function requestResponse(path: string, options: RequestOptions, accept = 'application/json') {
  const { signal, token, method, body } = options;
  const multipart = body instanceof FormData;
  const headers = new Headers({ Accept: accept });
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (body && !multipart) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      signal, credentials: 'omit', headers, method,
      cache: token ? 'no-store' : 'default',
      redirect: token || method ? 'error' : 'follow',
      body: multipart ? body : body && JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('connection');
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = z.object({ code: z.string() }).safeParse(payload);
    throw new ApiError(response.status, parsed.success ? parsed.data.code : undefined);
  }
  return response;
}

async function request<S extends z.ZodType>(path: string, schema: S, options: RequestOptions): Promise<z.output<S>> {
  const response = await requestResponse(path, options);
  try {
    return schema.parse(await response.json());
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('invalid-response');
  }
}

function get<S extends z.ZodType>(path: string, schema: S, signal: AbortSignal) {
  return request(path, schema, { signal });
}

const skillPath = (slug: string) => '/api/workers/' + encodeURIComponent(slug) + '/verification/skill';
const skillQueuePath = '/api/admin/verification/skill/submissions';

export function getSkillStatus(slug: string, offset: number, token: string, signal: AbortSignal) {
  return request(skillPath(slug) + '?limit=10&offset=' + offset, skillWorkerSchema, { token, signal });
}

export function submitSkillSample(slug: string, sampleId: string, token: string, signal: AbortSignal) {
  return request(skillPath(slug), skillResultSchema,
    { method: 'POST', body: { work_sample_id: sampleId }, token, signal });
}

export function getSkillQueue(status: SkillQueueFilter, offset: number, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '10', offset: String(offset), status });
  return request(skillQueuePath + '?' + params, skillQueueSchema, { token, signal });
}

export function reviewSkillSubmission(id: string, body: SkillReview, token: string, signal: AbortSignal) {
  return request(skillQueuePath + '/' + encodeURIComponent(id), skillResultSchema, { method: 'PATCH', body, token, signal });
}

const identityPath = (slug: string) => '/api/workers/' + encodeURIComponent(slug) + '/verification/identity';
const identityQueuePath = '/api/admin/verification/identity/submissions';

export function getIdentityStatus(slug: string, offset: number, token: string, signal: AbortSignal) {
  return request(identityPath(slug) + '?limit=10&offset=' + offset, identityStatusSchema, { token, signal });
}

export function submitIdentityDocument(slug: string, type: IdentityDocumentType, file: File, token: string, signal: AbortSignal) {
  const body = new FormData();
  body.set('document_type', type);
  body.set('document', file);
  return request(identityPath(slug), identityResultSchema, { method: 'POST', body, token, signal });
}

export function getIdentityQueue(status: SkillQueueFilter, offset: number, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '10', offset: String(offset), status });
  return request(identityQueuePath + '?' + params, identityQueueSchema, { token, signal });
}

export function reviewIdentitySubmission(id: string, body: SkillReview, token: string, signal: AbortSignal) {
  return request(identityQueuePath + '/' + encodeURIComponent(id), identityResultSchema, { method: 'PATCH', body, token, signal });
}

export async function getIdentityDocument(id: string, token: string, signal: AbortSignal) {
  const response = await requestResponse(identityQueuePath + '/' + encodeURIComponent(id) + '/document',
    { token, signal }, 'image/jpeg');
  if (response.headers.get('Content-Type') !== 'image/jpeg') throw new ApiError('invalid-response');
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new ApiError('invalid-response');
  return blob;
}

export function authenticate(mode: 'register' | 'login', body: Credentials, signal: AbortSignal) {
  return request('/api/auth/' + mode, sessionSchema, { method: 'POST', body, signal });
}

export function getMe(token: string, signal: AbortSignal) {
  return request('/api/auth/me', meSchema, { token, signal });
}

export function createProfile(body: NewProfile, token: string, signal: AbortSignal) {
  return request('/api/workers', ownedDetailSchema, { method: 'POST', body, token, signal });
}

export function updateProfile(slug: string, body: ProfileEdits, token: string, signal: AbortSignal) {
  return request('/api/workers/' + encodeURIComponent(slug), ownedDetailSchema, { method: 'PATCH', body, token, signal });
}

export function uploadAvatar(slug: string, image: File, token: string, signal: AbortSignal) {
  const body = new FormData();
  body.set('avatar', image);
  return request('/api/workers/' + encodeURIComponent(slug) + '/avatar',
    z.object({ avatar_url: z.string(), worker: ownedWorkerSchema }), { method: 'POST', body, token, signal });
}

export function uploadSample(slug: string, image: File, caption: string, token: string, signal: AbortSignal) {
  const body = new FormData();
  body.set('photo', image);
  if (caption) body.set('caption', caption);
  return request('/api/workers/' + encodeURIComponent(slug) + '/samples',
    z.object({ data: sampleSchema }), { method: 'POST', body, token, signal });
}

export function getWorkerFilters(signal: AbortSignal) {
  return get('/api/meta/filters', filtersSchema, signal);
}

export function describeApiError(error: unknown) {
  const status = error instanceof ApiError ? error.status : undefined;
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'PHONE_ALREADY_REGISTERED') return 'An account already uses this phone number. Sign in to continue.';
  if (code === 'INVALID_CREDENTIALS') return 'The phone number or password is incorrect.';
  if (code === 'FILE_TOO_LARGE' || status === 413) return 'Choose an image that is 5 MiB or smaller.';
  if (code && ['INVALID_FILE_TYPE', 'INVALID_FILE_EXTENSION', 'INVALID_FILE_SIGNATURE'].includes(code)) return 'Choose a valid JPEG, PNG, or WebP image.';
  if (code === 'WORKER_NOT_FOUND') return 'This worker profile is no longer available.';
  if (code === 'SKILL_SAMPLE_NOT_FOUND') return 'Choose an available work sample from your own profile.';
  if (code === 'SKILL_SUBMISSION_CONFLICT') return 'A submission is already active or verified. Refresh your status.';
  if (code === 'SKILL_STATUS_CONFLICT') return 'This submission changed. Check the refreshed review queue.';
  if (code === 'SKILL_SELF_REVIEW') return 'Another administrator must review this profile.';
  if (code === 'SKILL_SUBMISSION_NOT_FOUND') return 'This skill submission is no longer available.';
  if (code === 'IDENTITY_SUBMISSION_CONFLICT') return 'Your profile already has an active or verified identity submission.';
  if (code === 'IDENTITY_STATUS_CONFLICT') return 'This submission changed. Check the refreshed review queue.';
  if (code === 'IDENTITY_SELF_REVIEW') return 'Another administrator must review this profile.';
  if (code === 'IDENTITY_SUBMISSION_NOT_FOUND') return 'This identity submission is no longer available.';
  if (code === 'IDENTITY_STORAGE_UNAVAILABLE') return 'Identity documents are temporarily unavailable.';
  if (code === 'IDENTITY_DOCUMENT_REVIEW_REQUIRED') return 'Open and inspect the document before approving this submission.';
  if (code === 'INVALID_IDENTITY_IMAGE' || code === 'MIME_MISMATCH') return 'Choose a readable JPEG, PNG, or WebP image.';
  if (status === 'connection') return 'The SkillVerify service could not be reached. Check your connection and try again.';
  if (status === 503 || status === 502 || status === 504) return 'The SkillVerify service is temporarily unavailable. Try again in a moment.';
  if (status === 429) return 'Too many requests. Wait a few minutes before trying again.';
  if (status === 400) return 'The service could not accept this request. Check the information you entered and try again.';
  if (status === 401 || status === 403) return 'The service denied access to this request.';
  if (status === 'invalid-response') return 'The service returned data in an unexpected format. Try again later.';
  return 'Something went wrong while loading this page. Try again in a moment.';
}

export function listWorkers(filters: WorkerFilters, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: '12', offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return get('/api/workers?' + query, listSchema, signal);
}

export function getWorker(slug: string, signal: AbortSignal) {
  return get('/api/workers/' + encodeURIComponent(slug), detailSchema, signal);
}

export function mediaUrl(path: string | null) {
  // Current API returns public upload paths relative to its origin.
  return path && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(path) ? baseUrl + path : undefined;
}

export function contactLink(raw: string) {
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://wa.me' || !/^\/\d{10,15}$/.test(url.pathname)) return undefined;
    // Use the public WhatsApp destination with neutral copy.
    return 'https://wa.me' + url.pathname + '?text=' + encodeURIComponent('Hello, I found your profile on SkillVerify and would like to get in touch.');
  } catch {
    return undefined;
  }
}
