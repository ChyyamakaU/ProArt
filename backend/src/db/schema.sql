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

-- Phase 4A: portfolio-based Skill Verification
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_samples_worker_sample
  ON work_samples (worker_id, id);

CREATE TABLE IF NOT EXISTS skill_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  work_sample_id UUID NOT NULL,
  trade VARCHAR(80) NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reviewer_id INT REFERENCES users(id),
  review_started_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  reason TEXT,
  CONSTRAINT fk_skill_submission_owned_sample FOREIGN KEY (worker_id, work_sample_id)
    REFERENCES work_samples(worker_id, id),
  CONSTRAINT chk_skill_submission_review CHECK (
    (status = 'submitted' AND reviewer_id IS NULL AND review_started_at IS NULL AND decided_at IS NULL AND reason IS NULL)
    OR (status = 'under_review' AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL AND decided_at IS NULL AND reason IS NULL)
    OR (status = 'verified' AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL AND decided_at IS NOT NULL AND reason IS NULL)
    OR (status IN ('rejected', 'resubmission_required') AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL
        AND decided_at IS NOT NULL AND reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 1 AND 1000)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_submissions_active_worker
  ON skill_submissions(worker_id) WHERE status IN ('submitted', 'under_review');
CREATE INDEX IF NOT EXISTS idx_skill_submissions_worker_history
  ON skill_submissions(worker_id, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_skill_submissions_queue
  ON skill_submissions(status, submitted_at, id);

CREATE OR REPLACE FUNCTION enforce_skill_submission_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'submitted' THEN
      RETURN NEW;
    END IF;
  ELSIF (OLD.status = 'submitted' AND NEW.status = 'under_review')
     OR (OLD.status = 'under_review' AND NEW.status IN ('verified', 'rejected', 'resubmission_required')) THEN
    IF (NEW.id, NEW.worker_id, NEW.work_sample_id, NEW.trade, NEW.submitted_at)
       IS NOT DISTINCT FROM (OLD.id, OLD.worker_id, OLD.work_sample_id, OLD.trade, OLD.submitted_at) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Invalid skill submission transition' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_skill_submission_transition ON skill_submissions;
CREATE TRIGGER trg_skill_submission_transition BEFORE INSERT OR UPDATE ON skill_submissions
FOR EACH ROW EXECUTE FUNCTION enforce_skill_submission_transition();

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

-- Phase 4B: private Identity Verification
CREATE TABLE IF NOT EXISTS identity_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('national_id', 'passport', 'drivers_license', 'voter_card')),
  storage_key UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reviewer_id INT REFERENCES users(id),
  review_started_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  reason TEXT,
  CONSTRAINT chk_identity_submission_review CHECK (
    (status = 'submitted' AND reviewer_id IS NULL AND review_started_at IS NULL AND decided_at IS NULL AND reason IS NULL)
    OR (status = 'under_review' AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL AND decided_at IS NULL AND reason IS NULL)
    OR (status = 'verified' AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL AND decided_at IS NOT NULL AND reason IS NULL)
    OR (status IN ('rejected', 'resubmission_required') AND reviewer_id IS NOT NULL AND review_started_at IS NOT NULL
        AND decided_at IS NOT NULL AND reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 1 AND 1000)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_submissions_active_worker
  ON identity_submissions(worker_id) WHERE status IN ('submitted', 'under_review');
CREATE INDEX IF NOT EXISTS idx_identity_submissions_history
  ON identity_submissions(worker_id, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_identity_submissions_queue
  ON identity_submissions(status, submitted_at, id);

CREATE OR REPLACE FUNCTION enforce_identity_submission_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'submitted' THEN RETURN NEW; END IF;
  ELSIF (OLD.status = 'submitted' AND NEW.status = 'under_review')
     OR (OLD.status = 'under_review' AND NEW.status IN ('verified', 'rejected', 'resubmission_required')) THEN
    IF (NEW.id, NEW.worker_id, NEW.full_name, NEW.document_type, NEW.storage_key, NEW.submitted_at)
       IS NOT DISTINCT FROM (OLD.id, OLD.worker_id, OLD.full_name, OLD.document_type, OLD.storage_key, OLD.submitted_at) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Invalid identity submission transition' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_identity_submission_transition ON identity_submissions;
CREATE TRIGGER trg_identity_submission_transition BEFORE INSERT OR UPDATE ON identity_submissions
FOR EACH ROW EXECUTE FUNCTION enforce_identity_submission_transition();

CREATE TABLE IF NOT EXISTS identity_document_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES identity_submissions(id),
  administrator_id INT NOT NULL REFERENCES users(id),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_identity_document_access_submission ON identity_document_access(submission_id);
