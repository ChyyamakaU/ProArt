-- ============================================================================
-- SkillVerify PostgreSQL Schema (Idempotent Migration)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Users (Authentication Accounts for Workers & Admins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_users_phone_digits CHECK (phone ~ '^[1-9][0-9]{9,14}$'),
  CONSTRAINT chk_users_role CHECK (role IN ('worker', 'admin'))
);

-- ----------------------------------------------------------------------------
-- Workers (Artisans & Informal Skilled Workers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  trade VARCHAR(80) NOT NULL,
  location VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  years_experience SMALLINT NOT NULL DEFAULT 0
    CHECK (years_experience >= 0 AND years_experience <= 70),
  guild_endorsement VARCHAR(150),
  instagram_handle VARCHAR(80),
  avatar_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_workers_phone_digits CHECK (phone ~ '^[1-9][0-9]{9,14}$'),
  CONSTRAINT chk_workers_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Idempotent column upgrades for existing databases migrated from v1
ALTER TABLE workers ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS guild_endorsement VARCHAR(150);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(80);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE workers ALTER COLUMN is_verified SET DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers (user_id);
CREATE INDEX IF NOT EXISTS idx_workers_trade_lower ON workers (LOWER(trade));
CREATE INDEX IF NOT EXISTS idx_workers_location_lower ON workers (LOWER(location));
CREATE INDEX IF NOT EXISTS idx_workers_verified_created ON workers (is_verified DESC, created_at DESC);

-- ----------------------------------------------------------------------------
-- Work Samples (Verified Portfolio Photos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  image_url VARCHAR(512) NOT NULL,
  caption VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_work_samples_worker_image UNIQUE (worker_id, image_url)
);

CREATE INDEX IF NOT EXISTS idx_work_samples_worker_created
  ON work_samples (worker_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Reviews (Client Endorsements — Duplicate Phone Guard per Worker)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  client_name VARCHAR(100) NOT NULL,
  client_phone VARCHAR(20) NOT NULL,
  job_description TEXT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reviews_client_phone_digits CHECK (client_phone ~ '^[1-9][0-9]{9,14}$'),
  CONSTRAINT uq_reviews_worker_client_phone UNIQUE (worker_id, client_phone)
);

-- Idempotent column upgrade for existing databases migrated from v1
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS job_description TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_worker_created
  ON reviews (worker_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Trigger to keep workers.updated_at synchronized automatically
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workers_updated_at ON workers;

CREATE TRIGGER trg_workers_updated_at
BEFORE UPDATE ON workers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
