import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import sharp from 'sharp';

const testUrl = process.env.SKILLVERIFY_PHASE4B_TEST_DATABASE_URL;
const exec = promisify(execFile);

test('Phase 4B private identity workflow against PostgreSQL', {
  skip: !testUrl && 'Set SKILLVERIFY_PHASE4B_TEST_DATABASE_URL to a dedicated local skillverify_phase4b_test database.',
}, async t => {
  const url = new URL(testUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/skillverify_phase4b_test');
  assert.equal(url.search, '');
  const root = new pg.Pool({ connectionString: url.href });
  const schema = 'identity_' + randomUUID().replaceAll('-', '');
  const fresh = schema + '_fresh';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillverify-identity-test-'));
  const uploadDir = path.join(directory, 'public');
  const identityUploadDir = path.join(directory, 'private');
  const identityEncryptionKey = randomBytes(32).toString('hex');
  let server, closePool;
  t.after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closePool?.();
    try {
      await root.query(`DROP SCHEMA IF EXISTS "${schema}", "${fresh}" CASCADE`);
    } finally {
      await root.end();
      assert.match(path.relative(os.tmpdir(), path.resolve(directory)), /^skillverify-identity-test-[A-Za-z0-9]+$/);
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  await fs.mkdir(uploadDir);
  await root.query(`CREATE SCHEMA "${schema}"; CREATE SCHEMA "${fresh}"`);
  function connectionFor(searchPath) {
    const connection = new URL(url);
    connection.searchParams.set('options', '-c search_path=' + searchPath + ',public');
    return connection.href;
  }
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: connectionFor(schema),
    ALLOWED_ORIGINS: 'http://localhost:5173', FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: randomBytes(32).toString('hex'),
  });
  const db = await import('../src/config/db.js');
  closePool = db.closePool;
  const { pool } = db;
  const { createApp } = await import('../src/app.js');
  const { signAccessToken } = await import('../src/utils/jwt.js');
  const runner = fileURLToPath(new URL('../src/db/runSql.js', import.meta.url));
  const source = await fs.readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8');
  const marker = source.indexOf('-- Phase 4B:');
  assert.ok(marker > 0);
  await pool.query(source.slice(0, marker));
  const [owner, other, admin, second] = (await pool.query(
    `INSERT INTO users (phone, password_hash, role) VALUES
       ('2348000000141', 'fixture', 'worker'), ('2348000000142', 'fixture', 'worker'),
       ('2348000000143', 'fixture', 'admin'), ('2348000000144', 'fixture', 'admin')
     RETURNING id, phone, role`,
  )).rows;
  const worker = (await pool.query(
    `INSERT INTO workers (user_id, slug, full_name, trade, location, phone)
     VALUES ($1, 'identity-fixture', 'Fixture Worker', 'Tailor', 'Abuja', $2) RETURNING id`,
    [owner.id, owner.phone],
  )).rows[0];
  const sample = (await pool.query("INSERT INTO work_samples (worker_id, image_url) VALUES ($1, '/uploads/sample.png') RETURNING id", [worker.id])).rows[0];
  await pool.query("INSERT INTO skill_submissions (worker_id, work_sample_id, trade) VALUES ($1, $2, 'Tailor')", [worker.id, sample.id]);

  await t.test('fresh and Phase 4A migrations are repeatable and preserve skill submissions', async () => {
    for (const target of [fresh, fresh, schema, schema]) {
      await exec(process.execPath, [runner, 'schema.sql'], { env: { ...process.env, DATABASE_URL: connectionFor(target) } });
    }
    assert.equal((await pool.query('SELECT status FROM skill_submissions')).rows[0].status, 'submitted');
    assert.equal((await pool.query('SELECT id FROM identity_submissions')).rowCount, 0);
  });

  const allowed = (_req, _res, next) => next();
  const options = { uploadDir, identityUploadDir, identityEncryptionKey, trustProxy: 0, apiLimiter: allowed, writeLimiter: allowed };
  assert.throws(() => createApp({ ...options, identityUploadDir: path.join(uploadDir, 'private') }), /separate directories/);
  server = createApp(options).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const workerPath = '/api/workers/identity-fixture/verification/identity';
  const queue = '/api/admin/verification/identity/submissions';
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#172a47' } }).png().toBuffer();
  const feedback = 'Submit a clearer image for review.';
  async function request(route, user, method = 'GET', body) {
    const headers = {};
    if (user) headers.Authorization = 'Bearer ' + signAccessToken(user);
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(base + route, { method, headers, body: !body || body instanceof FormData ? body : JSON.stringify(body) });
  }
  function upload(user = owner, { bytes = png, type = 'image/png', name = 'fixture.png', documentType = 'passport' } = {}) {
    const form = new FormData();
    form.set('document_type', documentType);
    form.set('document', new Blob([bytes], { type }), name);
    return request(workerPath, user, 'POST', form);
  }
  const decide = (id, user, status, reason) => request(queue + '/' + id, user, 'PATCH', { status, reason });
  let id, storageKey;

  await t.test('validates ownership, actual image content, type and size before accepting evidence', async () => {
    assert.equal((await request(workerPath)).status, 401);
    assert.equal((await request(workerPath, other)).status, 404);
    assert.equal((await upload(other, { bytes: Buffer.alloc(6 * 1024 * 1024) })).status, 404);
    assert.equal((await upload(owner, { documentType: 'unsupported' })).status, 400);
    assert.equal((await upload(owner, { type: 'application/pdf', name: 'fixture.pdf' })).status, 400);
    assert.equal((await upload(owner, { bytes: png.subarray(0, 12) })).status, 400);
    assert.equal((await upload(owner, { bytes: Buffer.alloc(30) })).status, 400);
    assert.equal((await upload(owner, { bytes: Buffer.alloc(5 * 1024 * 1024 + 1) })).status, 413);
    const submissions = await Promise.all([upload(), upload()]);
    assert.deepEqual(submissions.map(item => item.status).sort(), [201, 409]);
    const first = await submissions.find(item => item.status === 201).json();
    assert.equal(first.data.status, 'submitted');
    id = first.data.id;
    storageKey = (await pool.query('SELECT storage_key FROM identity_submissions WHERE id = $1', [id])).rows[0].storage_key;
    assert.ok(!JSON.stringify(first).includes(storageKey));
    assert.deepEqual(await fs.readdir(identityUploadDir), [storageKey]);
    assert.deepEqual(await fs.readdir(uploadDir), []);
    const pendingCard = await (await request('/api/workers/identity-fixture')).json();
    assert.deepEqual(pendingCard.data.approved_verifications, {});
    for (const value of [storageKey, id, 'document_type']) assert.ok(!JSON.stringify(pendingCard).includes(value));
  });

  await t.test('blocks static, anonymous, worker, stale admin and self retrieval and audits authorised access', async () => {
    const document = queue + '/' + id + '/document';
    assert.equal((await request('/uploads/' + storageKey)).status, 404);
    assert.equal((await request('/private-identity/' + storageKey)).status, 404);
    await fs.symlink(identityUploadDir, path.join(uploadDir, 'private-alias'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await request('/uploads/private-alias/' + storageKey)).status, 404);
    assert.equal((await request(document)).status, 401);
    assert.equal((await request(document, owner)).status, 403);
    assert.equal((await request(document, other)).status, 403);
    assert.equal((await request(queue, other)).status, 403);
    await pool.query("UPDATE users SET role = 'worker' WHERE id = $1", [second.id]);
    assert.equal((await request(document, second)).status, 403);
    assert.equal((await request(queue, second)).status, 403);
    assert.equal((await decide(id, second, 'under_review')).status, 403);
    await pool.query("UPDATE users SET role = 'admin' WHERE id IN ($1, $2)", [owner.id, second.id]);
    const promoted = { ...owner, role: 'admin' };
    assert.equal((await request(document, promoted)).status, 403);
    assert.equal((await decide(id, promoted, 'under_review')).status, 403);
    await pool.query("UPDATE users SET role = 'worker' WHERE id = $1", [owner.id]);
    assert.equal((await pool.query('SELECT id FROM identity_document_access')).rowCount, 0);
    const response = await request(document, admin);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, 'jpeg');
    assert.notDeepEqual(await fs.readFile(path.join(identityUploadDir, storageKey)), bytes);
    const audit = (await pool.query('SELECT submission_id, administrator_id, accessed_at FROM identity_document_access')).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].administrator_id, admin.id);
    assert.equal(audit[0].submission_id, id);
    assert.ok(audit[0].accessed_at);
    const listing = await (await request(queue + '?limit=1', admin)).json();
    assert.equal(listing.data[0].id, id);
    assert.ok(!JSON.stringify(listing).includes(storageKey));
  });

  await t.test('enforces explicit document review, concurrent decisions and independent resubmission history', async () => {
    assert.equal((await decide(id, admin, 'verified')).status, 409);
    assert.equal((await decide(id, admin, 'under_review')).status, 200);
    assert.equal((await decide(id, second, 'verified')).status, 409);
    assert.equal((await decide(id, admin, 'rejected', ' ')).status, 400);
    assert.equal((await decide(id, admin, 'resubmission_required')).status, 400);
    const choices = await Promise.all([decide(id, admin, 'rejected', feedback), decide(id, second, 'resubmission_required', feedback)]);
    assert.deepEqual(choices.map(item => item.status).sort(), [200, 409]);
    const saved = (await pool.query('SELECT reviewer_id, decided_at, reason FROM identity_submissions WHERE id = $1', [id])).rows[0];
    assert.equal(saved.reviewer_id, choices[0].status === 200 ? admin.id : second.id);
    assert.ok(saved.decided_at);
    assert.equal(saved.reason, feedback);
    const rejectedCard = await (await request('/api/workers/identity-fixture')).json();
    assert.deepEqual(rejectedCard.data.approved_verifications, {});
    assert.ok(!JSON.stringify(rejectedCard).includes(feedback));
    const retry = await upload();
    assert.equal(retry.status, 201);
    const secondId = (await retry.json()).data.id;
    assert.notEqual(secondId, id);
    assert.equal((await decide(secondId, admin, 'under_review')).status, 200);
    const retrieved = await request(queue + '/' + secondId + '/document', admin);
    assert.equal(retrieved.status, 200);
    await retrieved.arrayBuffer();
    assert.equal((await decide(secondId, admin, 'verified')).status, 200);
    const own = await (await request(workerPath, owner)).json();
    assert.equal(own.status, 'verified');
    assert.equal(own.history[1].reason, feedback);
    assert.ok(!JSON.stringify(own).includes(storageKey));
    for (const [route, user] of [['/api/workers/identity-fixture'], ['/api/auth/me', owner]]) {
      const ordinary = JSON.stringify(await (await request(route, user)).json());
      for (const value of [storageKey, feedback, 'document_type', 'identity_submissions']) assert.ok(!ordinary.includes(value));
    }
    assert.equal((await pool.query('SELECT status FROM skill_submissions')).rows[0].status, 'submitted');
    const approvedCard = await (await request('/api/workers/identity-fixture')).json();
    assert.deepEqual(approvedCard.data.approved_verifications, { identity: true });
  });
});
