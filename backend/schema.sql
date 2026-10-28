CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','customer')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_setup_pending boolean NOT NULL DEFAULT false;
-- Separate owner/customer identities may share an inbox, never permissions or passwords.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_role_unique ON users(email,role);
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_verifications_user ON email_verifications(user_id);
CREATE TABLE IF NOT EXISTS verified_email_keys (
  key_hash text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS request_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON users(role) WHERE role = 'owner';
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
-- A single barber: every occupied interval shares the same exclusion constraint.
-- [start,end) permits adjacent appointments, including their cleaning interval.
CREATE TABLE IF NOT EXISTS calendar_entries (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('booking','block')),
  status text NOT NULL CHECK (status IN ('held','confirmed','completed','cancelled','expired','blocked')),
  starts_at timestamptz NOT NULL,
  service_ends_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < service_ends_at AND service_ends_at <= ends_at),
  CHECK ((kind='block' AND status IN ('blocked','cancelled')) OR
         (kind='booking' AND status IN ('held','confirmed','completed','cancelled','expired'))),
  CHECK (status <> 'held' OR expires_at IS NOT NULL),
  EXCLUDE USING gist (tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (status IN ('held','confirmed','completed','blocked'))
);
CREATE INDEX IF NOT EXISTS calendar_customer ON calendar_entries(user_id,starts_at);
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS notification_revision integer NOT NULL DEFAULT 0;
-- One honest, editable review per customer; deleting the account removes it.
CREATE TABLE IF NOT EXISTS customer_reviews (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES calendar_entries(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  event text NOT NULL CHECK (event IN ('confirmed','cancelled','rescheduled','reminder')),
  dedupe_key text NOT NULL UNIQUE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','drafting','prepared','cancelled','failed')),
  payload jsonb NOT NULL,
  draft jsonb,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_due ON notification_jobs(status,due_at);
-- SMTP acceptance is not confirmed inbox delivery. Uncertain sends are never auto-retried.
CREATE TABLE IF NOT EXISTS notification_email_deliveries (
  job_id uuid PRIMARY KEY REFERENCES notification_jobs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sending','accepted','uncertain','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
CREATE TABLE IF NOT EXISTS automation_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_poll timestamptz,
  last_prepared timestamptz
);
INSERT INTO automation_state(id) VALUES(true) ON CONFLICT DO NOTHING;
-- Reset tokens are hashed; raw links are never returned by the public API.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS delivery_state text NOT NULL DEFAULT 'draft' CHECK (delivery_state IN ('draft','pending','sent','failed'));
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY,
  referrer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  referred_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS identity_key text;
CREATE UNIQUE INDEX IF NOT EXISTS referral_identity_once ON referrals(identity_key) WHERE identity_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY,
  referral_id uuid NOT NULL UNIQUE REFERENCES referrals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  earned_booking_id uuid REFERENCES calendar_entries(id) ON DELETE SET NULL,
  redeemed_booking_id uuid UNIQUE REFERENCES calendar_entries(id) ON DELETE SET NULL,
  earned_at timestamptz NOT NULL,
  redeemed_at timestamptz
);
CREATE TABLE IF NOT EXISTS gallery (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS finance_entries (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  occurred_at timestamptz NOT NULL,
  local_date text NOT NULL,
  category text NOT NULL,
  note text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','other')),
  booking_id uuid REFERENCES calendar_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  CHECK (booking_id IS NULL OR kind='income')
);
CREATE INDEX IF NOT EXISTS finance_week ON finance_entries(occurred_at);
-- Arrival is separate from completion. Existing bookings are not marked or charged.
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS arrival_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS arrival_amount_cents integer CHECK (arrival_amount_cents>=0);
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS arrival_finance_entry_id uuid UNIQUE REFERENCES finance_entries(id);
CREATE TABLE IF NOT EXISTS gocho_requests (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 mode text NOT NULL CHECK(mode IN ('direct','natural')),
 input jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','done','failed','proposed','applied')),
 output jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS gocho_requests_owner_date ON gocho_requests(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS media_library (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('video','music')),
  data jsonb NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS media_library_source_unique ON media_library(kind,(data->>'sourceUrl')) WHERE data ? 'sourceUrl';

CREATE TABLE IF NOT EXISTS finance_plans (
  start_date text PRIMARY KEY,
  income_target_cents integer CHECK (income_target_cents>=0),
  expense_limit_cents integer CHECK (expense_limit_cents>=0),
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CHECK (starts_at < ends_at)
);
-- Voluntary waiting-list preferences; deleting an account removes all related data.
CREATE TABLE IF NOT EXISTS waitlist_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services(id),
  local_date text NOT NULL,
  from_time text NOT NULL,
  to_time text NOT NULL,
  email_consent boolean NOT NULL,
  whatsapp_consent boolean NOT NULL,
  phone text,
  consent_at timestamptz NOT NULL,
  known_available jsonb NOT NULL DEFAULT '[]',
  UNIQUE(user_id,service_id,local_date),
  CHECK (email_consent OR whatsapp_consent),
  CHECK (NOT whatsapp_consent OR phone IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS waitlist_notices (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES waitlist_subscriptions(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','cancelled')),
  draft jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(subscription_id,starts_at)
);
