import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

/** Maximum upload size in bytes (5 MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Whitelisted image MIME types. */
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Whitelisted filename extensions (lowercase). */
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Inspects file magic bytes to determine true image format regardless of
 * client-supplied MIME headers or filename extensions.
 *
 * @param {Buffer} buffer - Raw uploaded bytes.
 * @returns {{ mime: 'image/jpeg' | 'image/png' | 'image/webp', ext: 'jpg' | 'png' | 'webp' } | null}
 */
export function detectImageFromMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: "RIFF" at offset 0..3 and "WEBP" at offset 8..11
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

/**
 * Multer instance configured with memory storage so untrusted files are never
 * written to disk before magic-byte verification and authorization/existence checks.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 5,
    fieldSize: 4 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new AppError(
          400,
          'Unsupported file type. Only JPEG, PNG, and WebP images are allowed.',
          'INVALID_FILE_TYPE',
        ),
      );
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new AppError(
          400,
          'Unsupported file extension. Only .jpg, .jpeg, .png, and .webp files are allowed.',
          'INVALID_FILE_EXTENSION',
        ),
      );
    }

    return cb(null, true);
  },
});

/**
 * Middleware that accepts a single multipart file under the `photo` field.
 */
export const uploadSinglePhoto = uploader.single('photo');

/**
 * Middleware that accepts a single multipart profile avatar under the `avatar` field.
 */
export const uploadSingleAvatar = uploader.single('avatar');

export const uploadSingleIdentityDocument = uploader.single('document');

/**
 * Verifies magic bytes against the whitelisted MIME type and writes the image
 * to disk under a randomized UUID filename (never trusting `originalname`).
 *
 * @param {Express.Multer.File | undefined} file - Uploaded file from Multer memory storage.
 * @param {string} uploadDir - Resolved target directory for persisted uploads.
 * @returns {Promise<{ filename: string, imageUrl: string, absolutePath: string, mime: string }>}
 */
export function validateUploadedImage(file, missingMessage = 'A work sample photo file is required.') {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new AppError(400, missingMessage, 'FILE_REQUIRED');
  }

  const detected = detectImageFromMagicBytes(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new AppError(
      400,
      'Uploaded file failed binary signature verification. Only authentic JPEG, PNG, and WebP images are accepted.',
      'INVALID_FILE_SIGNATURE',
    );
  }

  if (detected.mime !== file.mimetype) {
    throw new AppError(
      400,
      'Uploaded file MIME type does not match its binary content.',
      'MIME_MISMATCH',
    );
  }
  return detected;
}

export async function verifyAndSaveImage(file, uploadDir) {
  const detected = validateUploadedImage(file);

  const resolvedUploadDir = path.resolve(uploadDir);
  await fs.mkdir(resolvedUploadDir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${detected.ext}`;
  const absolutePath = path.resolve(resolvedUploadDir, filename);

  // Defense-in-depth path traversal guard.
  if (!absolutePath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
    throw new AppError(500, 'Failed to store uploaded file safely.', 'UPLOAD_STORAGE_ERROR');
  }

  await fs.writeFile(absolutePath, file.buffer, { flag: 'wx', mode: 0o644 });

  return {
    filename,
    imageUrl: `/uploads/${filename}`,
    absolutePath,
    mime: detected.mime,
  };
}

/**
 * Best-effort cleanup of an uploaded file if a subsequent DB write fails.
 *
 * @param {string | null | undefined} absolutePath
 * @returns {Promise<void>}
 */
export async function cleanupUploadedFile(absolutePath) {
  if (!absolutePath) {
    return;
  }
  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.error('[UPLOAD] Failed to remove orphaned file:', err.message);
    }
  }
}
