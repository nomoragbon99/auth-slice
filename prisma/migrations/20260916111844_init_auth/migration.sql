-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_codes_user_id_key" ON "email_verification_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
-- Blocks two visually-identical addresses (e.g. "Foo@Bar.com" and "foo@bar.com", or one with
-- leading/trailing whitespace) from ever coexisting as distinct rows. The app lowercases and
-- trims before insert; this CHECK is the actual guarantee, not just app-level discipline.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_trimmed" CHECK (email = lower(btrim(email)));

-- CheckConstraint
-- Blocks an empty display name (NOT NULL alone would not catch '') and an unbounded one that
-- could break the dashboard layout or be used to abuse storage.
ALTER TABLE "users" ADD CONSTRAINT "users_name_length" CHECK (char_length(name) BETWEEN 1 AND 80);

-- CheckConstraint
-- Blocks a negative attempt count, which would silently grant extra guesses beyond the
-- application's max-attempts limit (a bug or a hand-written fix decrementing past zero).
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_attempts_non_negative" CHECK (attempts >= 0);

-- CheckConstraint
-- Blocks a code that is born already-expired (e.g. a bug passing a negative TTL), which would
-- be indistinguishable from a legitimate row until someone tried to verify it.
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_expires_after_created" CHECK (expires_at > created_at);

-- CheckConstraint
-- Same reasoning as email_verification_codes: blocks a reset token born already-expired.
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_expires_after_created" CHECK (expires_at > created_at);

-- CheckConstraint
-- Blocks a rate-limit bucket existing with a zero or negative count: such a row is pointless
-- (a bucket only exists once something has happened) and a negative value could only come
-- from a subtraction bug, which should fail loudly rather than silently under-count attempts.
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_count_positive" CHECK (count > 0);

-- CheckConstraint
-- Blocks any status value the handler code has no branch for: a request is either still being
-- worked on ('processing') or done ('completed'), never anything else.
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_status_valid" CHECK (status IN ('processing', 'completed'));

-- CheckConstraint
-- Blocks the invalid combination "marked completed but no response was ever recorded", which
-- would make a replay of this idempotency key return nothing to a legitimately retrying client.
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_completed_has_response" CHECK (status = 'processing' OR (response_status IS NOT NULL AND response_body IS NOT NULL));
