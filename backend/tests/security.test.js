import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// Configure required test environment variables BEFORE importing env-bound modules.
process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/skillverify_test';
process.env.ALLOWED_ORIGINS = 'https://skillverify.ng,http://localhost:5173';
process.env.FRONTEND_URL = 'https://skillverify.ng';
process.env.JWT_SECRET = 'test-only-super-secret-signing-key-at-least-32-chars-long';
process.env.JWT_EXPIRES_IN = '7d';

const { createApp } = await import('../src/app.js');
const { createAuthController } = await import('../src/controllers/auth.controller.js');
const { createWorkersController } = await import('../src/controllers/workers.controller.js');
const { createRateLimiters } = await import('../src/middleware/rateLimiter.js');
const { sanitizePhoneNumber } = await import('../src/utils/phone.js');
const { detectImageFromMagicBytes } = await import('../src/middleware/upload.js');

/**
 * Minimal valid 1x1 PNG binary buffer for authentic magic-byte upload tests.
 */
const VALID_PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

/**
 * Starts an Express app on an ephemeral localhost port and returns baseUrl + close helper.
 *
 * @param {import('express').Express} app
 */
async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

/**
 * In-memory PostgreSQL query simulator supporting auth, workers, samples, and reviews.
 */
function createMockDb() {
  let nextUserId = 2;
  let nextWorkerNum = 2;

  const state = {
    users: [
      {
        id: 1,
        phone: '2348034128891',
        password_hash: '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
        role: 'worker',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    workers: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: 1,
        slug: 'chinedu-okafor-electrician-abj01',
        full_name: 'Chinedu Okafor',
        trade: 'Electrician',
        location: 'Wuse II, Abuja',
        phone: '2348034128891',
        bio: 'Certified electrician in Abuja.',
        years_experience: 9,
        guild_endorsement: 'LECAN FCT Chapter',
        instagram_handle: '@chinedu_electricals_abj',
        avatar_url: '/uploads/seed-avatar-chinedu.jpg',
        is_verified: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    samples: [
      {
        worker_id: '11111111-1111-4111-8111-111111111111',
        image_url: '/uploads/sample.jpg',
        caption: 'Distribution board',
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    reviews: [
      {
        worker_id: '11111111-1111-4111-8111-111111111111',
        client_name: 'Zainab Mohammed',
        client_phone: '2348091100202',
        job_description: '12-way distribution board upgrade',
        rating: 5,
        comment: 'Excellent and neat job.',
        created_at: '2026-01-03T00:00:00.000Z',
      },
    ],
  };

  function computeReviewStats(workerId) {
    const workerReviews = state.reviews.filter((r) => r.worker_id === workerId);
    const review_count = workerReviews.length;
    const avg_rating =
      review_count > 0
        ? (
            workerReviews.reduce((sum, r) => sum + Number(r.rating), 0) / review_count
          ).toFixed(2)
        : null;
    return { review_count, avg_rating, workerReviews };
  }

  async function dbQuery(sql, params = []) {
    // --- USERS ---
    if (sql.includes('INSERT INTO users')) {
      const [phone, password_hash, role] = params;
      if (state.users.some((u) => u.phone === phone)) {
        const pgErr = new Error('duplicate key value violates unique constraint "users_phone_key"');
        pgErr.code = '23505';
        throw pgErr;
      }
      const user = {
        id: nextUserId++,
        phone,
        password_hash,
        role,
        created_at: new Date().toISOString(),
      };
      state.users.push(user);
      return { rows: [user] };
    }

    if (sql.includes('FROM users') && sql.includes('WHERE phone = $1')) {
      const found = state.users.find((u) => u.phone === params[0]);
      return { rows: found ? [found] : [] };
    }

    if (sql.includes('FROM users') && sql.includes('WHERE id = $1')) {
      const found = state.users.find((u) => u.id === Number(params[0]));
      return { rows: found ? [found] : [] };
    }

    // --- WORKERS ---
    if (sql.includes('SELECT COUNT(*)::int AS total')) {
      return { rows: [{ total: state.workers.length }] };
    }

    if (sql.includes('FROM workers w') && sql.includes('LIMIT $')) {
      return {
        rows: state.workers.map((w) => {
          const { review_count, avg_rating, workerReviews } = computeReviewStats(w.id);
          const work_samples = state.samples
            .filter((s) => s.worker_id === w.id)
            .map(({ image_url, caption, created_at }) => ({ image_url, caption, created_at }));
          const reviews = workerReviews.map(
            ({ client_name, job_description, rating, comment, created_at }) => ({
              client_name,
              job_description,
              rating,
              comment,
              created_at,
            }),
          );
          return { ...w, review_count, avg_rating, work_samples, reviews };
        }),
      };
    }

    if (sql.includes('FROM workers w') && sql.includes('WHERE w.user_id = $1')) {
      const found = state.workers.find((w) => w.user_id === Number(params[0]));
      if (!found) return { rows: [] };
      const { review_count, avg_rating } = computeReviewStats(found.id);
      return { rows: [{ ...found, review_count, avg_rating }] };
    }

    if (sql.includes('FROM workers w') && sql.includes('WHERE w.slug = $1')) {
      const found = state.workers.find((w) => w.slug === params[0]);
      if (!found) return { rows: [] };
      const { review_count, avg_rating } = computeReviewStats(found.id);
      return { rows: [{ ...found, review_count, avg_rating }] };
    }

    if (sql.includes('SELECT slug FROM workers WHERE user_id = $1')) {
      const found = state.workers.find((w) => w.user_id === Number(params[0]));
      return { rows: found ? [{ slug: found.slug }] : [] };
    }

    if (sql.includes('SELECT id, user_id FROM workers WHERE slug = $1')) {
      const found = state.workers.find((w) => w.slug === params[0]);
      return { rows: found ? [{ id: found.id, user_id: found.user_id }] : [] };
    }

    if (sql.includes('SELECT id FROM workers WHERE slug = $1')) {
      const found = state.workers.find((w) => w.slug === params[0]);
      return { rows: found ? [{ id: found.id }] : [] };
    }

    if (sql.includes('INSERT INTO workers')) {
      const [
        user_id,
        slug,
        full_name,
        trade,
        location,
        phone,
        bio,
        years_experience,
        guild_endorsement,
        instagram_handle,
      ] = params;
      const created = {
        id: `00000000-0000-4000-8000-00000000000${nextWorkerNum++}`,
        user_id,
        slug,
        full_name,
        trade,
        location,
        phone,
        bio,
        years_experience,
        guild_endorsement,
        instagram_handle,
        avatar_url: null,
        is_verified: true,
        created_at: new Date().toISOString(),
      };
      state.workers.push(created);
      return { rows: [created] };
    }

    if (sql.includes('UPDATE workers')) {
      const workerId = params[params.length - 1];
      const worker = state.workers.find((w) => w.id === workerId);
      if (!worker) return { rows: [] };

      const setSegment = sql.split('SET')[1].split('WHERE')[0].trim();
      const assignments = setSegment.split(',').map((s) => s.trim());
      for (const assignment of assignments) {
        const [col, placeholder] = assignment.split('=').map((s) => s.trim());
        const idx = Number(placeholder.slice(1)) - 1;
        worker[col] = params[idx];
      }
      return { rows: [{ ...worker }] };
    }

    // --- WORK SAMPLES ---
    if (sql.includes('FROM work_samples')) {
      return {
        rows: state.samples
          .filter((s) => s.worker_id === params[0])
          .map(({ image_url, caption, created_at }) => ({ image_url, caption, created_at })),
      };
    }

    if (sql.includes('INSERT INTO work_samples')) {
      const [worker_id, image_url, caption] = params;
      const sample = {
        worker_id,
        image_url,
        caption,
        created_at: new Date().toISOString(),
      };
      state.samples.push(sample);
      return { rows: [sample] };
    }

    // --- REVIEWS ---
    if (sql.includes('SELECT') && sql.includes('AVG(rating)') && sql.includes('FROM reviews')) {
      const { review_count, avg_rating } = computeReviewStats(params[0]);
      return { rows: [{ review_count, avg_rating }] };
    }

    if (sql.includes('FROM reviews')) {
      return {
        rows: state.reviews
          .filter((r) => r.worker_id === params[0])
          .map(({ client_name, job_description, rating, comment, created_at }) => ({
            client_name,
            job_description,
            rating,
            comment,
            created_at,
          })),
      };
    }

    if (sql.includes('INSERT INTO reviews')) {
      const [worker_id, client_name, client_phone, job_description, rating, comment] = params;
      const duplicate = state.reviews.some(
        (r) => r.worker_id === worker_id && r.client_phone === client_phone,
      );
      if (duplicate) {
        const pgErr = new Error(
          'duplicate key value violates unique constraint "uq_reviews_worker_client_phone"',
        );
        pgErr.code = '23505';
        throw pgErr;
      }
      const review = {
        worker_id,
        client_name,
        client_phone,
        job_description,
        rating,
        comment,
        created_at: new Date().toISOString(),
      };
      state.reviews.push(review);
      return { rows: [review] };
    }

    throw new Error(`Unexpected SQL in mock: ${sql}`);
  }

  return { state, dbQuery };
}

describe('Unit Security Utilities', () => {
  it('sanitizes Nigerian and international phone numbers to digits-only format', () => {
    assert.equal(sanitizePhoneNumber('0803 123 4567'), '2348031234567');
    assert.equal(sanitizePhoneNumber('+234 (0) 812-555-0199'), '2348125550199');
    assert.equal(sanitizePhoneNumber('002347063319204'), '2347063319204');
    assert.equal(sanitizePhoneNumber('+44 7700 900077'), '447700900077');
    assert.equal(sanitizePhoneNumber('12345'), null);
    assert.equal(sanitizePhoneNumber('not-a-phone'), null);
  });

  it('detects authentic image magic bytes and rejects spoofed text/HTML payloads', () => {
    assert.deepEqual(detectImageFromMagicBytes(VALID_PNG_BUFFER), {
      mime: 'image/png',
      ext: 'png',
    });
    assert.deepEqual(
      detectImageFromMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])),
      { mime: 'image/jpeg', ext: 'jpg' },
    );
    assert.equal(detectImageFromMagicBytes(Buffer.from('<script>alert(1)</script>')), null);
  });
});

describe('SkillVerify Hardened API: Auth, Ownership, Security & MVP Flows', () => {
  let tempUploadDir;
  let serverHandle;
  let userAToken;
  let userBToken;
  let userAWorkerSlug;

  before(async () => {
    tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillverify-uploads-'));
    const { dbQuery } = createMockDb();

    const workersController = createWorkersController({
      dbQuery,
      checkHealth: async () => ({ ok: true, latencyMs: 2 }),
      uploadDir: tempUploadDir,
    });

    const authController = createAuthController({
      dbQuery,
      // Keep bcrypt cost realistic; 4 rounds in unit tests keeps suite fast while production defaults to 12.
      bcryptRounds: 4,
    });

    const { apiLimiter, strictWriteLimiter, authLimiter } = createRateLimiters({
      apiMax: 200,
      strictMax: 50,
      authMax: 50,
    });

    const app = createApp({
      allowedOrigins: ['https://skillverify.ng', 'http://localhost:5173'],
      uploadDir: tempUploadDir,
      apiLimiter,
      writeLimiter: strictWriteLimiter,
      authLimiter,
      controller: workersController,
      authController,
    });

    serverHandle = await startTestServer(app);
  });

  after(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
    if (tempUploadDir) {
      await fs.rm(tempUploadDir, { recursive: true, force: true });
    }
  });

  it('sets Helmet security headers, strict CSP, and strips X-Powered-By', async () => {
    const res = await fetch(`${serverHandle.baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.database, 'connected');
  });

  it('enforces explicit CORS allow-list and rejects unauthorized origins', async () => {
    const allowed = await fetch(`${serverHandle.baseUrl}/api/health`, {
      headers: { Origin: 'https://skillverify.ng' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://skillverify.ng');

    const denied = await fetch(`${serverHandle.baseUrl}/api/health`, {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(denied.status, 403);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.code, 'CORS_NOT_ALLOWED');
  });

  it('registers users, blocks duplicate phones & admin self-escalation, and handles login/invalid credentials', async () => {
    // Reject admin privilege escalation during public registration
    const adminAttempt = await fetch(`${serverHandle.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '0803 555 6677',
        password: 'StrongPassword123!',
        role: 'admin',
      }),
    });
    assert.equal(adminAttempt.status, 400);

    // Register User A
    const regA = await fetch(`${serverHandle.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '0803 555 6677',
        password: 'StrongPassword123!',
      }),
    });
    assert.equal(regA.status, 201);
    const regABody = await regA.json();
    assert.ok(regABody.token);
    assert.equal(regABody.user.phone, '2348035556677');
    assert.equal(regABody.user.role, 'worker');
    assert.equal('password_hash' in regABody.user, false);
    userAToken = regABody.token;

    // Duplicate registration with differently formatted same phone -> 409
    const dupReg = await fetch(`${serverHandle.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+234 (0) 803-555-6677',
        password: 'AnotherPassword123!',
      }),
    });
    assert.equal(dupReg.status, 409);
    assert.equal((await dupReg.json()).code, 'PHONE_ALREADY_REGISTERED');

    // Register User B for cross-user authorization tests
    const regB = await fetch(`${serverHandle.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '0809 888 7766',
        password: 'UserBPassword123!',
      }),
    });
    assert.equal(regB.status, 201);
    userBToken = (await regB.json()).token;

    // Login with valid credentials
    const loginOk = await fetch(`${serverHandle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+234 803 555 6677',
        password: 'StrongPassword123!',
      }),
    });
    assert.equal(loginOk.status, 200);
    const loginOkBody = await loginOk.json();
    assert.ok(loginOkBody.token);
    assert.equal(loginOkBody.user.phone, '2348035556677');

    // Login with wrong password -> generic 401 Invalid credentials
    const wrongPass = await fetch(`${serverHandle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '08035556677',
        password: 'WrongPassword!',
      }),
    });
    assert.equal(wrongPass.status, 401);
    const wrongPassBody = await wrongPass.json();
    assert.equal(wrongPassBody.error, 'Invalid credentials');
    assert.equal(wrongPassBody.code, 'INVALID_CREDENTIALS');

    // Login with non-existent phone -> identical generic 401 Invalid credentials
    const unknownPhone = await fetch(`${serverHandle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '08090001111',
        password: 'StrongPassword123!',
      }),
    });
    assert.equal(unknownPhone.status, 401);
    const unknownPhoneBody = await unknownPhone.json();
    assert.equal(unknownPhoneBody.error, 'Invalid credentials');
    assert.equal(unknownPhoneBody.code, 'INVALID_CREDENTIALS');
  });

  it('blocks unauthenticated worker creation, profile updates, photo uploads, and /auth/me (401)', async () => {
    const meRes = await fetch(`${serverHandle.baseUrl}/api/auth/me`);
    assert.equal(meRes.status, 401);

    const createRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Unauth Worker',
        trade: 'Painter',
        location: 'Wuse, Abuja',
        phone: '08035556677',
      }),
    });
    assert.equal(createRes.status, 401);
    assert.equal((await createRes.json()).code, 'UNAUTHORIZED');

    const patchRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: 'Hijacked bio' }),
      },
    );
    assert.equal(patchRes.status, 401);

    const sampleForm = new FormData();
    sampleForm.append('photo', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'test.png');
    const uploadRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01/samples`,
      { method: 'POST', body: sampleForm },
    );
    assert.equal(uploadRes.status, 401);
  });

  it('rejects mass-assignment and prototype pollution payloads on protected endpoints', async () => {
    const massAssignRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        full_name: 'Ibrahim Sani',
        trade: 'Welder',
        location: 'Nyanya, Abuja',
        phone: '08035556677',
        is_verified: true,
      }),
    });
    assert.equal(massAssignRes.status, 400);
    assert.equal((await massAssignRes.json()).code, 'VALIDATION_ERROR');

    const protoRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: '{"full_name":"Test","trade":"Plumber","location":"Abuja","phone":"08035556677","__proto__":{"isAdmin":true}}',
    });
    assert.equal(protoRes.status, 400);
    assert.equal((await protoRes.json()).code, 'FORBIDDEN_PROPERTY');
  });

  it('executes full authenticated worker creation, duplicate prevention, /auth/me, profile update, sample upload, and public review flow', async () => {
    // 1. User A creates worker Trust Card
    const createRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        full_name: 'Kemi Adeola',
        trade: 'Hair Stylist',
        location: 'Garki, Abuja',
        phone: '0803-555-6677',
        bio: 'Braiding and loc specialist.',
        years_experience: 4,
        guild_endorsement: 'Abuja Cosmetology & Hairstylists Guild',
        instagram_handle: 'kemi_braids_abj',
      }),
    });
    assert.equal(createRes.status, 201);
    const { data: created } = await createRes.json();
    assert.match(created.slug, /^kemi-adeola-hair-stylist-[a-f0-9]{6}$/);
    assert.equal(created.guild_endorsement, 'Abuja Cosmetology & Hairstylists Guild');
    assert.equal(created.instagram_handle, '@kemi_braids_abj');
    assert.equal(created.is_verified, true);
    assert.equal('id' in created, false);
    assert.equal('user_id' in created, false);
    assert.ok(created.whatsapp_links.hire_url.startsWith('https://wa.me/2348035556677?text='));
    assert.ok(created.whatsapp_links.share_url.startsWith('https://wa.me/?text='));
    assert.equal(created.whatsapp_links.card_url, `https://skillverify.ng/workers/${created.slug}`);
    userAWorkerSlug = created.slug;

    // 2. User A cannot create a duplicate worker profile
    const dupProfileRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        full_name: 'Kemi Second Profile',
        trade: 'Makeup Artist',
        location: 'Wuse II, Abuja',
        phone: '08035556677',
      }),
    });
    assert.equal(dupProfileRes.status, 409);
    assert.equal((await dupProfileRes.json()).code, 'WORKER_PROFILE_EXISTS');

    // 3. GET /api/auth/me returns authenticated user + linked Trust Card
    const meRes = await fetch(`${serverHandle.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.phone, '2348035556677');
    assert.equal('password_hash' in meBody.user, false);
    assert.equal(meBody.worker.slug, userAWorkerSlug);
    assert.equal('user_id' in meBody.worker, false);

    // 4. User A updates own Trust Card via PATCH
    const patchRes = await fetch(`${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        location: 'Wuse II, Abuja',
        years_experience: 5,
        bio: 'Master knotless braids and bridal hair stylist in Abuja.',
        instagram_handle: '@kemi_luxury_hair',
      }),
    });
    assert.equal(patchRes.status, 200);
    const { data: patched } = await patchRes.json();
    assert.equal(patched.location, 'Wuse II, Abuja');
    assert.equal(patched.years_experience, 5);
    assert.equal(patched.instagram_handle, '@kemi_luxury_hair');

    // 5. User A uploads a spoofed file (blocked by magic bytes) and a valid PNG (accepted with UUID)
    const spoofForm = new FormData();
    spoofForm.append(
      'photo',
      new Blob(['<html>not-an-image</html>'], { type: 'image/png' }),
      'evil.png',
    );
    const spoofRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}/samples`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: spoofForm,
      },
    );
    assert.equal(spoofRes.status, 400);
    assert.equal((await spoofRes.json()).code, 'INVALID_FILE_SIGNATURE');

    const validForm = new FormData();
    validForm.append('photo', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), '../../hacked.png');
    validForm.append('caption', 'Knotless boho braids finished in Wuse II');
    const validUploadRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}/samples`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: validForm,
      },
    );
    assert.equal(validUploadRes.status, 201);
    const validUploadBody = await validUploadRes.json();
    assert.match(
      validUploadBody.data.image_url,
      /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );

    // 6. Public review submission with job_description + duplicate phone spam guard
    const review1 = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Amina Bello',
          client_phone: '0803 777 8899',
          job_description: 'Bridal knotless braids & styling',
          rating: 5,
          comment: 'Neat parts, zero tension, and finished right on schedule.',
        }),
      },
    );
    assert.equal(review1.status, 201);
    const review1Body = await review1.json();
    assert.equal(review1Body.data.job_description, 'Bridal knotless braids & styling');
    assert.equal('client_phone' in review1Body.data, false);

    const reviewDup = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Amina B.',
          client_phone: '+234 (0) 803-777-8899',
          rating: 5,
          comment: 'Duplicate spam review.',
        }),
      },
    );
    assert.equal(reviewDup.status, 409);
    assert.equal((await reviewDup.json()).code, 'DUPLICATE_REVIEW');

    // 7. Public GET /api/workers/:slug & GET /api/workers expose full MVP fields without PII
    const detailRes = await fetch(`${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}`);
    assert.equal(detailRes.status, 200);
    const { data: profile } = await detailRes.json();
    assert.equal(profile.avg_rating, 5);
    assert.equal(profile.review_count, 1);
    assert.equal(profile.work_samples.length, 1);
    assert.equal(profile.reviews.length, 1);
    assert.equal(profile.reviews[0].job_description, 'Bridal knotless braids & styling');
    assert.equal('client_phone' in profile.reviews[0], false);
    assert.equal('user_id' in profile, false);
    assert.equal('password_hash' in profile, false);
    assert.equal('id' in profile, false);

    const listRes = await fetch(`${serverHandle.baseUrl}/api/workers`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.data.length >= 2);
    for (const worker of listBody.data) {
      assert.equal('user_id' in worker, false);
      assert.equal('password_hash' in worker, false);
      assert.equal('id' in worker, false);
      assert.ok(worker.whatsapp_links.hire_url);
      assert.ok(worker.whatsapp_links.share_url);
      assert.ok(worker.whatsapp_links.card_url);
      assert.ok(Array.isArray(worker.work_samples));
      assert.ok(Array.isArray(worker.reviews));
    }
  });

  it('blocks cross-user profile edits and sample uploads with 403 FORBIDDEN', async () => {
    const crossPatch = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({ bio: 'Unauthorized cross-user edit attempt' }),
      },
    );
    assert.equal(crossPatch.status, 403);
    assert.equal((await crossPatch.json()).code, 'FORBIDDEN');

    const crossForm = new FormData();
    crossForm.append('photo', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'sneaky.png');
    crossForm.append('caption', 'Unauthorized sample upload');

    const crossUpload = await fetch(
      `${serverHandle.baseUrl}/api/workers/${userAWorkerSlug}/samples`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userBToken}` },
        body: crossForm,
      },
    );
    assert.equal(crossUpload.status, 403);
    assert.equal((await crossUpload.json()).code, 'FORBIDDEN');
  });

  it('enforces strict auth rate limiter (429 RATE_LIMIT_EXCEEDED after limit)', async () => {
    const { apiLimiter, strictWriteLimiter, authLimiter } = createRateLimiters({
      apiMax: 100,
      strictMax: 10,
      authMax: 2,
    });
    const { dbQuery } = createMockDb();
    const limitedApp = createApp({
      allowedOrigins: ['https://skillverify.ng'],
      uploadDir: tempUploadDir,
      apiLimiter,
      writeLimiter: strictWriteLimiter,
      authLimiter,
      controller: createWorkersController({
        dbQuery,
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        uploadDir: tempUploadDir,
      }),
      authController: createAuthController({ dbQuery, bcryptRounds: 4 }),
    });

    const limitedServer = await startTestServer(limitedApp);
    try {
      const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '08031112222', password: 'WrongPassword123!' }),
      };

      const r1 = await fetch(`${limitedServer.baseUrl}/api/auth/login`, opts);
      const r2 = await fetch(`${limitedServer.baseUrl}/api/auth/login`, opts);
      const r3 = await fetch(`${limitedServer.baseUrl}/api/auth/login`, opts);

      assert.equal(r1.status, 401);
      assert.equal(r2.status, 401);
      assert.equal(r3.status, 429);
      assert.equal((await r3.json()).code, 'RATE_LIMIT_EXCEEDED');
    } finally {
      await limitedServer.close();
    }
  });
});
