import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES, validateUploadedImage } from '../middleware/upload.js';
import { AppError } from './AppError.js';

function canonicalPath(input) {
  let cursor = path.resolve(input);
  const tail = [];
  while (true) {
    try {
      return path.join(realpathSync(cursor), ...tail);
    } catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(cursor) === cursor) throw error;
      tail.unshift(path.basename(cursor));
      cursor = path.dirname(cursor);
    }
  }
}

function encloses(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}

export function assertSeparateIdentityStorage(publicDir, privateDir) {
  const publicRoot = canonicalPath(publicDir);
  const privateRoot = canonicalPath(privateDir);
  if (encloses(publicRoot, privateRoot) || encloses(privateRoot, publicRoot)) {
    throw new Error('Identity storage and public uploads must use separate directories.');
  }
  return privateRoot;
}

// Express static can follow links. Only serve files whose resolved path remains inside the public root.
export function protectPublicUploadRoot(publicDir) {
  return async (req, res, next) => {
    try {
      const candidate = path.resolve(publicDir, '.' + decodeURIComponent(req.path));
      const [root, target] = await Promise.all([fs.realpath(publicDir), fs.realpath(candidate)]);
      if (!encloses(root, target)) return res.sendStatus(404);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return res.sendStatus(404);
    }
    next();
  };
}

export function createIdentityStorage({ publicDir, directory, encryptionKey }) {
  const key = encryptionKey && Buffer.from(encryptionKey, 'hex');
  const available = Boolean(key);
  assertSeparateIdentityStorage(publicDir, directory);

  function requireAvailable() {
    if (!available) throw new AppError(503, 'Identity document storage is unavailable.', 'IDENTITY_STORAGE_UNAVAILABLE');
  }

  async function prepare(file) {
    requireAvailable();
    const detected = validateUploadedImage(file, 'An identity document image is required.');
    try {
      const image = sharp(file.buffer, { failOn: 'warning', limitInputPixels: 16_000_000 });
      const meta = await image.metadata();
      if (meta.format !== detected.ext.replace('jpg', 'jpeg') || (meta.pages ?? 1) !== 1) throw new Error();
      const bytes = await image.rotate().jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new AppError(413, 'The processed image exceeds the 5 MiB limit.', 'FILE_TOO_LARGE');
      }
      return bytes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'Choose a readable, single-image JPEG, PNG, or WebP file.', 'INVALID_IDENTITY_IMAGE');
    }
  }

  async function save(bytes) {
    requireAvailable();
    const root = assertSeparateIdentityStorage(publicDir, directory);
    const storageKey = randomUUID();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(storageKey));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      const resolved = assertSeparateIdentityStorage(publicDir, root);
      await fs.writeFile(path.join(resolved, storageKey), Buffer.concat([iv, cipher.getAuthTag(), ciphertext]),
        { flag: 'wx', mode: 0o600 });
    } catch {
      throw new AppError(503, 'Identity document storage is unavailable.', 'IDENTITY_STORAGE_UNAVAILABLE');
    }
    return storageKey;
  }

  async function read(storageKey) {
    requireAvailable();
    if (!/^[0-9a-f-]{36}$/i.test(storageKey)) throw new Error('Invalid identity storage key.');
    try {
      const root = assertSeparateIdentityStorage(publicDir, directory);
      const filename = path.join(root, storageKey);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.size > MAX_UPLOAD_BYTES + 28) throw new Error();
      const encrypted = await fs.readFile(filename);
      const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12));
      decipher.setAAD(Buffer.from(storageKey));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
    } catch {
      throw new AppError(503, 'This identity document could not be retrieved.', 'IDENTITY_STORAGE_UNAVAILABLE');
    }
  }

  async function discard(storageKey) {
    try {
      const root = assertSeparateIdentityStorage(publicDir, directory);
      await fs.unlink(path.join(root, storageKey));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('[IDENTITY] Uncommitted document cleanup failed.');
    }
  }

  return { available, requireAvailable, prepare, save, read, discard };
}
