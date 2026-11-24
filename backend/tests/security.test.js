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

const { createApp } = await import('../src/app.js');
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
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
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
    assert.equal(
      detectImageFromMagicBytes(Buffer.from('<script>alert(1)</script>')),
      null,
    );
  });
});

describe('SkillVerify Hardened API Integration & Security Controls', () => {
  let tempUploadDir;
  let serverHandle;
  const mockDbState = {
    workers: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'chinedu-okafor-electrician-abj01',
        full_name: 'Chinedu Okafor',
        trade: 'Electrician',
        location: 'Wuse II, Abuja',
        phone: '2348034128891',
        bio: 'Certified electrician in Abuja.',
        years_experience: 9,
        is_verified: true,
        avg_rating: '4.50',
        review_count: 2,
        sample_count: 1,
        cover_image_url: '/uploads/sample.jpg',
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
        rating: 5,
        comment: 'Excellent and neat job.',
        created_at: '2026-01-03T00:00:00.000Z',
      },
    ],
  };

  before(async () => {
    tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillverify-uploads-'));

    const mockDbQuery = async (sql, params = []) => {
      if (sql.includes('SELECT COUNT(*)::int AS total')) {
        return { rows: [{ total: mockDbState.workers.length }] };
      }

      if (sql.includes('FROM workers w') && sql.includes('LIMIT $')) {
        return { rows: mockDbState.workers };
      }

      if (sql.includes('WHERE w.slug = $1')) {
        const found = mockDbState.workers.find((w) => w.slug === params[0]);
        return { rows: found ? [found] : [] };
      }

      if (sql.includes('SELECT id FROM workers WHERE slug = $1')) {
        const found = mockDbState.workers.find((w) => w.slug === params[0]);
        return { rows: found ? [{ id: found.id }] : [] };
      }

      if (sql.includes('FROM work_samples')) {
        return {
          rows: mockDbState.samples
            .filter((s) => s.worker_id === params[0])
            .map(({ image_url, caption, created_at }) => ({ image_url, caption, created_at })),
        };
      }

      if (sql.includes('FROM reviews')) {
        return {
          rows: mockDbState.reviews
            .filter((r) => r.worker_id === params[0])
            .map(({ client_name, rating, comment, created_at }) => ({
              client_name,
              rating,
              comment,
              created_at,
            })),
        };
      }

      if (sql.includes('INSERT INTO workers')) {
        const [slug, full_name, trade, location, phone, bio, years_experience] = params;
        const created = {
          id: '22222222-2222-4222-8222-222222222222',
          slug,
          full_name,
          trade,
          location,
          phone,
          bio,
          years_experience,
          is_verified: false,
          created_at: new Date().toISOString(),
        };
        mockDbState.workers.push(created);
        return { rows: [created] };
      }

      if (sql.includes('INSERT INTO work_samples')) {
        const [worker_id, image_url, caption] = params;
        const sample = {
          worker_id,
          image_url,
          caption,
          created_at: new Date().toISOString(),
        };
        mockDbState.samples.push(sample);
        return { rows: [sample] };
      }

      if (sql.includes('INSERT INTO reviews')) {
        const [worker_id, client_name, client_phone, rating, comment] = params;
        const duplicate = mockDbState.reviews.some(
          (r) => r.worker_id === worker_id && r.client_phone === client_phone,
        );
        if (duplicate) {
          const pgErr = new Error('duplicate key value violates unique constraint "uq_reviews_worker_client_phone"');
          pgErr.code = '23505';
          throw pgErr;
        }
        const review = {
          worker_id,
          client_name,
          client_phone,
          rating,
          comment,
          created_at: new Date().toISOString(),
        };
        mockDbState.reviews.push(review);
        return { rows: [review] };
      }

      throw new Error(`Unexpected SQL in mock: ${sql}`);
    };

    const controller = createWorkersController({
      dbQuery: mockDbQuery,
      checkHealth: async () => ({ ok: true, latencyMs: 2 }),
      uploadDir: tempUploadDir,
    });

    const { apiLimiter, strictWriteLimiter } = createRateLimiters({
      apiMax: 100,
      strictMax: 10,
    });

    const app = createApp({
      allowedOrigins: ['https://skillverify.ng', 'http://localhost:5173'],
      uploadDir: tempUploadDir,
      apiLimiter,
      writeLimiter: strictWriteLimiter,
      controller,
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

  it('minimizes PII on GET /api/workers/:slug (no internal id, no client_phone, has whatsapp_links)', async () => {
    const res = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01`,
    );
    assert.equal(res.status, 200);
    const { data } = await res.json();

    assert.equal(data.slug, 'chinedu-okafor-electrician-abj01');
    assert.equal('id' in data, false);
    assert.equal('phone' in data, false);
    assert.equal(data.avg_rating, 4.5);
    assert.equal(data.review_count, 2);
    assert.ok(data.whatsapp_links.hire.startsWith('https://wa.me/2348034128891?text='));
    assert.ok(data.whatsapp_links.share.startsWith('https://wa.me/?text='));
    assert.equal(data.reviews.length, 1);
    assert.equal('client_phone' in data.reviews[0], false);
    assert.equal('id' in data.reviews[0], false);
  });

  it('rejects unexpected properties (mass-assignment & prototype pollution) via Zod strict schemas', async () => {
    const massAssignRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Ibrahim Sani',
        trade: 'Welder',
        location: 'Nyanya, Abuja',
        phone: '08035556677',
        is_verified: true,
      }),
    });
    assert.equal(massAssignRes.status, 400);
    const massAssignBody = await massAssignRes.json();
    assert.equal(massAssignBody.code, 'VALIDATION_ERROR');

    const protoRes = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"full_name":"Test","trade":"Plumber","location":"Abuja","phone":"08035556677","__proto__":{"isAdmin":true}}',
    });
    assert.equal(protoRes.status, 400);
    const protoBody = await protoRes.json();
    assert.equal(protoBody.code, 'FORBIDDEN_PROPERTY');
  });

  it('creates worker with sanitized Nigerian phone and collision-safe slug', async () => {
    const res = await fetch(`${serverHandle.baseUrl}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Kemi Adeola',
        trade: 'Hair Stylist',
        location: 'Garki, Abuja',
        phone: '0803-555-6677',
        bio: 'Braiding and loc specialist.',
        years_experience: 4,
      }),
    });
    assert.equal(res.status, 201);
    const { data } = await res.json();
    assert.match(data.slug, /^kemi-adeola-hair-stylist-[a-f0-9]{6}$/);
    assert.equal(data.is_verified, false);
    assert.equal('id' in data, false);
    assert.ok(data.whatsapp_links.hire.includes('https://wa.me/2348035556677?text='));
  });

  it('blocks duplicate review spam from the same client phone on the same worker', async () => {
    const first = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Adamu Garba',
          client_phone: '0803 777 8899',
          rating: 5,
          comment: 'Very reliable.',
        }),
      },
    );
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal('client_phone' in firstBody.data, false);

    // Same phone formatted differently must still be normalized and blocked as duplicate
    const duplicate = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Adamu G.',
          client_phone: '+234 (0) 803-777-8899',
          rating: 5,
          comment: 'Spam duplicate review.',
        }),
      },
    );
    assert.equal(duplicate.status, 409);
    const dupBody = await duplicate.json();
    assert.equal(dupBody.code, 'DUPLICATE_REVIEW');
  });

  it('rejects spoofed image uploads failing magic-byte verification and accepts valid PNG with UUID filename', async () => {
    const spoofForm = new FormData();
    spoofForm.append(
      'photo',
      new Blob(['<html>not-an-image</html>'], { type: 'image/png' }),
      'evil.png',
    );
    spoofForm.append('caption', 'Spoofed upload');

    const spoofRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01/samples`,
      { method: 'POST', body: spoofForm },
    );
    assert.equal(spoofRes.status, 400);
    const spoofBody = await spoofRes.json();
    assert.equal(spoofBody.code, 'INVALID_FILE_SIGNATURE');

    const validForm = new FormData();
    validForm.append('photo', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), '../../hacked.png');
    validForm.append('caption', 'Verified electrical installation');

    const validRes = await fetch(
      `${serverHandle.baseUrl}/api/workers/chinedu-okafor-electrician-abj01/samples`,
      { method: 'POST', body: validForm },
    );
    assert.equal(validRes.status, 201);
    const validBody = await validRes.json();
    assert.match(
      validBody.data.image_url,
      /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
    assert.equal(validBody.data.caption, 'Verified electrical installation');
  });

  it('enforces strict write rate limiter (429 RATE_LIMIT_EXCEEDED after limit)', async () => {
    const { apiLimiter, strictWriteLimiter } = createRateLimiters({
      apiMax: 100,
      strictMax: 2,
    });
    const limitedApp = createApp({
      allowedOrigins: ['https://skillverify.ng'],
      uploadDir: tempUploadDir,
      apiLimiter,
      writeLimiter: strictWriteLimiter,
      controller: createWorkersController({
        dbQuery: async () => ({ rows: [] }),
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        uploadDir: tempUploadDir,
      }),
    });

    const limitedServer = await startTestServer(limitedApp);
    try {
      const payload = JSON.stringify({
        full_name: 'Rate Test',
        trade: 'Painter',
        location: 'Abuja',
        phone: 'invalid',
      });
      const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      };

      const r1 = await fetch(`${limitedServer.baseUrl}/api/workers`, opts);
      const r2 = await fetch(`${limitedServer.baseUrl}/api/workers`, opts);
      const r3 = await fetch(`${limitedServer.baseUrl}/api/workers`, opts);

      assert.equal(r1.status, 400);
      assert.equal(r2.status, 400);
      assert.equal(r3.status, 429);
      const body = await r3.json();
      assert.equal(body.code, 'RATE_LIMIT_EXCEEDED');
    } finally {
      await limitedServer.close();
    }
  });
});
