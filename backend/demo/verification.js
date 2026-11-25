import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import sharp from 'sharp';
import { demoProfiles, syntheticDisclosure } from './profiles.js';

const connection = new URL(process.env.SKILLVERIFY_DEMO_DATABASE_URL ?? 'postgresql://invalid');
if (connection.protocol !== 'postgresql:' || connection.hostname !== '127.0.0.1'
  || connection.pathname !== '/skillverify_investor_demo' || connection.search || connection.hash) {
  throw new Error('Set SKILLVERIFY_DEMO_DATABASE_URL to the dedicated local skillverify_investor_demo database at 127.0.0.1.');
}

const port = Number(process.env.SKILLVERIFY_DEMO_PORT ?? 4000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a demo API port between 1024 and 65535.');
const browserOrigin = 'http://localhost:5173';
const password = 'SkillVerify-Demo-Only-2026!';
const adminPhone = '2340000000002';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillverify-investor-demo-'));
const uploadDir = path.join(root, 'public');
const identityUploadDir = path.join(root, 'private');

async function artwork(lines, filename) {
  const text = lines.map((line, index) =>
    '<text x="40" y="' + (68 + index * 45) + '" font-size="' + (index === 0 ? 28 : 20) + '">' + line + '</text>').join('');
  const image = '<svg width="680" height="265" xmlns="http://www.w3.org/2000/svg"><rect width="680" height="265" fill="#eef4ff"/><g fill="#10213c" font-family="sans-serif">' + text + '</g></svg>';
  await sharp(Buffer.from(image)).png().toFile(filename);
}

function identityPath(profile) {
  return path.join(root, 'synthetic-identity-' + profile.asset + '.png');
}

const database = new pg.Client({ connectionString: connection.href });
await database.connect();
try {
  await database.query('BEGIN');
  await database.query('SET LOCAL search_path TO public');
  await database.query("SELECT pg_advisory_xact_lock(hashtext('skillverify_investor_demo'))");
  const existing = await database.query("SELECT to_regclass('public.users') AS users, to_regclass('public.workers') AS workers");
  for (const table of ['users', 'workers']) {
    if (existing.rows[0][table] && (await database.query('SELECT 1 FROM public.' + table + ' LIMIT 1')).rowCount) {
      throw new Error('The demo requires an empty database. Existing records were left untouched.');
    }
  }
  await database.query(await fs.readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
  const hash = await bcrypt.hash(password, 12);
  await fs.mkdir(uploadDir);
  await database.query("INSERT INTO users (phone, password_hash, role) VALUES ($1, $2, 'admin')", [adminPhone, hash]);
  for (const [index, profile] of demoProfiles.entries()) {
    const filenames = [profile.asset + '-portrait.jpg', ...profile.samples.map((_, sample) => profile.asset + '-work-' + (sample + 1) + '.jpg')];
    await Promise.all(filenames.map(filename => fs.copyFile(new URL('./assets/' + filename, import.meta.url), path.join(uploadDir, filename))));
    await artwork(['SYNTHETIC DEMO DOCUMENT', 'NOT VALID AS IDENTIFICATION', profile.name, 'Fictional profile for administrator review'], identityPath(profile));
    const account = await database.query("INSERT INTO users (phone, password_hash, role) VALUES ($1, $2, 'worker') RETURNING id",
      [profile.phone, hash]);
    const worker = await database.query(
      `INSERT INTO workers (user_id, slug, full_name, trade, location, phone, bio, years_experience, avatar_url, is_verified, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, NOW() - $10 * INTERVAL '1 day') RETURNING id`,
      [account.rows[0].id, profile.slug, profile.name, profile.trade, profile.location, profile.phone,
        profile.bio + '\n\n' + syntheticDisclosure, profile.years, '/uploads/' + filenames[0], index],
    );
    for (const [sampleIndex, caption] of profile.samples.entries()) {
      await database.query(
        `INSERT INTO work_samples (worker_id, image_url, caption, created_at)
         VALUES ($1, $2, $3, NOW() - $4 * INTERVAL '1 minute')`,
        [worker.rows[0].id, '/uploads/' + filenames[sampleIndex + 1], caption, sampleIndex],
      );
    }
  }
  await database.query('COMMIT');
} catch (error) {
  await database.query('ROLLBACK');
  throw error;
} finally {
  await database.end();
}

Object.assign(process.env, {
  NODE_ENV: 'development', PORT: String(port), DATABASE_URL: connection.href, DATABASE_SSL: 'false',
  ALLOWED_ORIGINS: browserOrigin, FRONTEND_URL: browserOrigin,
  JWT_SECRET: randomBytes(32).toString('hex'), JWT_EXPIRES_IN: '4h',
  UPLOAD_DIR: uploadDir, IDENTITY_UPLOAD_DIR: identityUploadDir, IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const { createApp } = await import('../src/app.js');
const { closePool } = await import('../src/config/db.js');
const server = createApp({ trustProxy: 0 }).listen(port, '127.0.0.1');
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
console.log('Synthetic demo API: http://localhost:' + port);
console.log('Worker: ' + demoProfiles[0].phone + ' | Administrator: ' + adminPhone);
console.log('Shared synthetic demo password: ' + password);
console.log('Synthetic ID image to upload: ' + identityPath(demoProfiles[0]));
console.log('Trust Card: ' + browserOrigin + '/workers/' + demoProfiles[0].slug);
for (const profile of demoProfiles) {
  console.log(profile.name + ' (synthetic): ' + profile.phone + ' | ' + browserOrigin + '/workers/' + profile.slug + ' | ID: ' + identityPath(profile));
}

function stop() {
  server.close(async () => { await closePool(); });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
