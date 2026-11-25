import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

const execute = promisify(execFile);
const testUrl = process.env.SKILLVERIFY_PHASE4A_TEST_DATABASE_URL;
const reason = 'Show the finished installation and describe your role.';

test('Phase 4A PostgreSQL migration, authorization and concurrent workflow', {
  skip: !testUrl && 'Set SKILLVERIFY_PHASE4A_TEST_DATABASE_URL to a dedicated local skillverify_phase4a_test database.',
}, async t => {
  const database = new URL(testUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
  assert.equal(database.pathname, '/skillverify_phase4a_test');
  assert.equal(database.search, '');
  const root = new pg.Pool({ connectionString: database.href });
  const schema = 'skill_phase4a_' + randomUUID().replaceAll('-', '');
  const fresh = schema + '_fresh';
  t.after(async () => {
    try {
      await root.query(`DROP SCHEMA IF EXISTS "${schema}", "${fresh}" CASCADE`);
    } finally {
      await root.end();
    }
  });
  await root.query(`CREATE SCHEMA "${schema}"; CREATE SCHEMA "${fresh}"`);

  function connectionFor(searchPath) {
    const url = new URL(database);
    url.searchParams.set('options', '-c search_path=' + searchPath + ',public');
    return url.href;
  }

  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: connectionFor(schema),
    ALLOWED_ORIGINS: 'http://localhost:5173', FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: randomBytes(32).toString('hex'),
  });

  const { pool, closePool } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  const { signAccessToken } = await import('../src/utils/jwt.js');
  const runner = fileURLToPath(new URL('../src/db/runSql.js', import.meta.url));
  const fixtureSchema = await readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8');
  const migrationStart = fixtureSchema.indexOf('-- Phase 4A:');
  const reviewsStart = fixtureSchema.lastIndexOf('-- ----------------------------------------------------------------------------', fixtureSchema.indexOf('-- Reviews ('));
  assert.ok(migrationStart > 0 && reviewsStart > migrationStart);
  const migrate = url => execute(process.execPath, [runner, 'schema.sql'], {
    env: { ...process.env, DATABASE_URL: url },
  });

  let server;
  t.after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closePool();
  });

  await pool.query(fixtureSchema.slice(0, migrationStart) + fixtureSchema.slice(reviewsStart));
  const accounts = (await pool.query(
    `INSERT INTO users (phone, password_hash, role) VALUES
       ('2348000000011', 'test-fixture', 'worker'),
       ('2348000000012', 'test-fixture', 'worker'),
       ('2348000000013', 'test-fixture', 'admin'),
       ('2348000000014', 'test-fixture', 'admin')
     RETURNING id, phone, role`,
  )).rows;
  const [owner, other, admin, adminTwo] = accounts;
  const workerRows = (await pool.query(
    `INSERT INTO workers (user_id, slug, full_name, trade, location, phone) VALUES
       ($1, 'owner-card', 'Owner Fixture', 'Electrician', 'Abuja', $2),
       ($3, 'other-card', 'Other Fixture', 'Plumber', 'Abuja', $4) RETURNING id, slug`,
    [owner.id, owner.phone, other.id, other.phone],
  )).rows;
  const [ownerWorker, otherWorker] = workerRows;
  const sampleRows = (await pool.query(
    `INSERT INTO work_samples (worker_id, image_url, caption)
     VALUES ($1, '/uploads/owner.jpg', 'Installation'), ($2, '/uploads/other.jpg', 'Repair') RETURNING id`,
    [ownerWorker.id, otherWorker.id],
  )).rows;
  const [ownerSample, otherSample] = sampleRows;
  await pool.query(
    "INSERT INTO reviews (worker_id, client_name, client_phone, rating) VALUES ($1, 'Fixture Reviewer', '2348000000015', 5)",
    [ownerWorker.id],
  );

  await t.test('current migration preserves existing data and can be run twice', async () => {
    await migrate(connectionFor(fresh));
    await migrate(connectionFor(fresh));
    await migrate(connectionFor(schema));
    await migrate(connectionFor(schema));
    for (const [table, count] of [['users', 4], ['workers', 2], ['work_samples', 2], ['reviews', 1], ['skill_submissions', 0]]) {
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count, count);
    }
    assert.equal((await pool.query('SELECT slug, is_verified FROM workers WHERE id = $1', [ownerWorker.id])).rows[0].slug, 'owner-card');
  });

  const unbounded = (_req, _res, next) => next();
  server = createApp({ apiLimiter: unbounded, writeLimiter: unbounded, trustProxy: 0 }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const workerPath = '/api/workers/owner-card/verification/skill';
  const queue = '/api/admin/verification/skill/submissions';
  async function request(path, user, method = 'GET', body) {
    const headers = {};
    if (user) headers.Authorization = 'Bearer ' + signAccessToken(user);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  const submit = (sample = ownerSample) => request(workerPath, owner, 'POST', { work_sample_id: sample.id });
  const decide = (id, user, body) => request(queue + '/' + id, user, 'PATCH', body);
  let id;

  await t.test('only the owner can retrieve or submit valid evidence from their own portfolio', async () => {
    assert.equal((await request(workerPath)).status, 401);
    assert.equal((await request(workerPath, other)).status, 404);
    assert.equal((await request(workerPath, other, 'POST', { work_sample_id: otherSample.id })).status, 404);
    assert.equal((await request(workerPath, owner, 'POST', { work_sample_id: 'invalid' })).status, 400);
    assert.equal((await request(workerPath, owner, 'POST', { work_sample_id: ownerSample.id, status: 'verified' })).status, 400);
    assert.equal((await submit(otherSample)).body.code, 'SKILL_SAMPLE_NOT_FOUND');
    await assert.rejects(pool.query('INSERT INTO skill_submissions(worker_id, work_sample_id, trade) VALUES ($1, $2, $3)',
      [ownerWorker.id, otherSample.id, 'Electrician']), { code: '23503' });
    const initial = await request(workerPath, owner);
    assert.equal(initial.body.status, 'not_started');
    assert.equal(initial.cache, 'no-store');
    assert.deepEqual(initial.body.samples.map(item => item.id), [ownerSample.id]);
    assert.deepEqual((await request('/api/workers/owner-card')).body.data.approved_verifications, {});
    const responses = await Promise.all([submit(), submit()]);
    assert.deepEqual(responses.map(item => item.status).sort(), [201, 409]);
    id = responses.find(item => item.status === 201).body.data.id;
    const pendingCard = (await request('/api/workers/owner-card')).body.data;
    assert.deepEqual(pendingCard.approved_verifications, {});
    assert.ok(!JSON.stringify(pendingCard).includes(id));
  });

  await t.test('review requires current admin privileges and excludes the owner', async () => {
    assert.equal((await request(queue)).status, 401);
    assert.equal((await request(queue, owner)).status, 403);
    assert.equal((await decide(id, owner, { status: 'under_review' })).status, 403);
    await pool.query("UPDATE users SET role = 'worker' WHERE id = $1", [adminTwo.id]);
    assert.equal((await request(queue, adminTwo)).status, 403);
    assert.equal((await decide(id, adminTwo, { status: 'under_review' })).status, 403);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminTwo.id]);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [owner.id]);
    const promotedOwner = { ...owner, role: 'admin' };
    assert.equal((await request(queue, promotedOwner)).body.data[0].can_review, false);
    assert.equal((await decide(id, promotedOwner, { status: 'under_review' })).body.code, 'SKILL_SELF_REVIEW');
    await pool.query("UPDATE users SET role = 'worker' WHERE id = $1", [owner.id]);
    assert.equal((await request(queue + '?limit=1', admin)).body.data[0].sample.id, ownerSample.id);
    assert.equal((await request(queue + '?limit=1&offset=1', admin)).body.data.length, 0);
  });

  await t.test('review conflicts are atomic and feedback survives resubmission', async () => {
    assert.equal((await decide(id, admin, { status: 'verified' })).status, 409);
    await assert.rejects(pool.query("UPDATE skill_submissions SET status = 'verified' WHERE id = $1", [id]), { code: '23514' });
    const started = await decide(id, admin, { status: 'under_review' });
    assert.equal(started.body.data.status, 'under_review');
    assert.ok(started.body.data.review_started_at);
    assert.equal((await submit()).status, 409);
    for (const status of ['rejected', 'resubmission_required']) {
      assert.equal((await decide(id, admin, { status, reason: '   ' })).status, 400);
    }
    const decisions = await Promise.all([
      decide(id, admin, { status: 'rejected', reason }),
      decide(id, adminTwo, { status: 'resubmission_required', reason }),
    ]);
    assert.deepEqual(decisions.map(item => item.status).sort(), [200, 409]);
    const winner = decisions.findIndex(item => item.status === 200);
    const decision = decisions[winner].body.data;
    const row = (await pool.query('SELECT reviewer_id, decided_at FROM skill_submissions WHERE id = $1', [id])).rows[0];
    assert.equal(row.reviewer_id, [admin.id, adminTwo.id][winner]);
    assert.ok(row.decided_at);
    assert.equal((await request(workerPath, owner)).body.current.reason, reason);
    const rejectedCard = (await request('/api/workers/owner-card')).body.data;
    assert.deepEqual(rejectedCard.approved_verifications, {});
    assert.ok(!JSON.stringify(rejectedCard).includes(reason));
    const retried = await submit();
    assert.equal(retried.status, 201);
    assert.notEqual(retried.body.data.id, id);
    const second = retried.body.data.id;
    assert.equal((await decide(second, admin, { status: 'under_review' })).status, 200);
    assert.equal((await decide(second, admin, { status: 'verified' })).body.data.status, 'verified');
    assert.equal((await submit()).status, 409);
    const view = await request(workerPath + '?limit=1&offset=1', owner);
    assert.equal(view.body.status, 'verified');
    assert.equal(view.body.history[0].status, decision.status);
    assert.equal(view.body.history[0].reason, reason);
    assert.equal('reviewer_id' in view.body.history[0], false);
    const publicCard = await request('/api/workers/owner-card');
    assert.equal(publicCard.status, 200);
    assert.equal(publicCard.body.data.slug, 'owner-card');
    assert.equal('skill_verification' in publicCard.body.data, false);
    assert.deepEqual(publicCard.body.data.approved_verifications, { skill: true });
    assert.ok(!JSON.stringify(publicCard.body).includes(reason));
  });
});
