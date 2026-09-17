# DOC_FACTS.md

A factual reference pack for whoever writes `DOCUMENTATION.md`. This file does not explain,
narrate, or draw conclusions beyond quoting the real code, config, and logs of this repository.
Every code block below is copied verbatim from the file named above it. Do not treat anything
here as final prose — write `DOCUMENTATION.md` separately, using this as source material.

---

## 1. Repository identity and file tree

- **Repo name:** `auth-slice`
- **GitHub URL:** https://github.com/nomoragbon99/auth-slice.git

**Full file tree** (excluding `node_modules`, `.next`, `.git`, `src/generated`):

```
.env
.env.example
.gitattributes
.gitignore
AGENTS.md
BUILD_LOG.md
CLAUDE.md
DECISIONS.md
README.md
docker-compose.yml
docs/evidence/README.md
docs/evidence/api-smoke-test.md
docs/evidence/constraints.md
docs/evidence/e1-users-hash.md
docs/evidence/e1-users-hash.png
docs/evidence/e2-signup-curl.md
docs/evidence/e3-rate-limits.md
docs/evidence/e4-code-expired.png
docs/evidence/e4-code-expiry.md
docs/evidence/e5-reset-single-use.md
docs/evidence/e6-drift-check.md
docs/evidence/env-check.txt
docs/evidence/protected-routes.md
eslint.config.mjs
next-env.d.ts
next.config.ts
package-lock.json
package.json
postcss.config.mjs
prisma.config.ts
prisma/migrations/20260916111844_init_auth/migration.sql
prisma/migrations/migration_lock.toml
prisma/schema.prisma
scripts/check-safe-redirect.ts
scripts/check-security-core.ts
src/app/(auth)/forgot-password/page.tsx
src/app/(auth)/reset-password/ResetPasswordForm.tsx
src/app/(auth)/reset-password/page.tsx
src/app/(auth)/sign-in/SignInForm.tsx
src/app/(auth)/sign-in/page.tsx
src/app/(auth)/sign-up/page.tsx
src/app/(auth)/verify-email/VerifyEmailForm.tsx
src/app/(auth)/verify-email/page.tsx
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/resend-code/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/auth/signin/route.ts
src/app/api/auth/signout/route.ts
src/app/api/auth/signup/route.ts
src/app/api/auth/verify-email/route.ts
src/app/dashboard/SignOutButton.tsx
src/app/dashboard/page.tsx
src/app/error.tsx
src/app/global-error.tsx
src/app/globals.css
src/app/layout.tsx
src/app/not-found.tsx
src/app/page.tsx
src/components/auth/AuthCard.tsx
src/components/auth/FormAlert.tsx
src/components/auth/FormField.tsx
src/components/auth/SubmitButton.tsx
src/components/auth/styles.ts
src/components/auth/useAuthForm.ts
src/config/auth.ts
src/lib/auth/email.ts
src/lib/auth/password.ts
src/lib/auth/session.ts
src/lib/auth/tokens.ts
src/lib/db.ts
src/lib/http.ts
src/lib/security/idempotency.ts
src/lib/security/origin.ts
src/lib/security/rate-limit.ts
src/lib/security/safe-redirect.ts
src/lib/validation/auth.ts
src/proxy.ts
tsconfig.json
```

(`.env` is listed above because it exists on this developer's disk — `git ls-files` confirms it is
NOT tracked; see section 8/`env-check.txt`. `tmp/` and `tsconfig.tsbuildinfo` are gitignored
build/scratch artifacts and are omitted.)

---

## 2. Run steps, as they actually work

**Node version:** `v26.3.1` (confirmed via `node --version` on the development machine; this is a
Current release, not an LTS — see DECISIONS.md's "Node runtime version" entry, quoted in full in
section 7).

**Environment variables** (from `.env.example`, quoted verbatim):
```
# PostgreSQL connection string for the Docker Compose database (npm run db:up).
# Local development credentials only; matches docker-compose.yml (host port 5433).
DATABASE_URL="postgresql://auth:auth@localhost:5433/auth"

# Base URL of the running app, used to build links in emails (reset password).
# Port 3001 because port 3000 is used by another local project.
APP_URL="http://localhost:3001"

# From resend.com > API Keys.
# OPTIONAL: leave empty and emails are printed to the server console instead of sent.
RESEND_API_KEY=""

# Sender shown on outgoing emails. onboarding@resend.dev works without a verified domain.
EMAIL_FROM="Auth Slice <onboarding@resend.dev>"

# Server-only secret used to key the HMAC that hashes email verification codes. At least 32
# random bytes, base64url-encoded. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
AUTH_SECRET=""

# Set to true ONLY when deployed behind a proxy you control that sets X-Forwarded-For. Default false.
TRUST_PROXY=""
```

| Variable | Where its value comes from |
|---|---|
| `DATABASE_URL` | Must match `docker-compose.yml`'s port mapping (`5433:5432`) and its `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (all `auth`). Fixed local value, no external source. |
| `APP_URL` | Must match the port the app is run on (`3001`, hardcoded in `package.json`'s `dev`/`start` scripts). Used to build reset-password links and to validate `Origin` in `src/lib/security/origin.ts`. |
| `RESEND_API_KEY` | From resend.com's dashboard, API Keys page. Optional — if empty, `src/lib/auth/email.ts` prints emails to the server console instead of sending. |
| `EMAIL_FROM` | Any address you're allowed to send as. `onboarding@resend.dev` works without domain verification, per Resend's docs. |
| `AUTH_SECRET` | Generated locally by the developer with the exact command in the comment above; not fetched from anywhere external. |
| `TRUST_PROXY` | Set to `"true"` only in a deployment sitting behind a proxy that itself sets/overwrites `X-Forwarded-For`; left empty for local development. |

**Database start and migrate commands** (from `package.json`):
```json
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"db:migrate": "prisma migrate dev && prisma generate",
"db:studio": "prisma studio --port 5555"
```

**App start commands:**
```json
"dev": "next dev -p 3001",
"build": "next build",
"start": "next start -p 3001"
```

**The URL it runs at:** `http://localhost:3001` (both `dev` and `start`; hardcoded via `-p 3001`,
matching `APP_URL` in `.env.example`).

**Full sequence from a fresh clone:**
1. `npm install` (installs deps; `prisma generate` is not currently wired as a `postinstall`
   script — confirmed absent from `package.json`'s `scripts` block, quoted in full above and in
   section 7's BUILD_LOG entry on this exact point).
2. Copy `.env.example` to `.env` and fill in `AUTH_SECRET` (required) and optionally
   `RESEND_API_KEY`/`EMAIL_FROM`.
3. `npm run db:up` — starts `postgres:18-alpine` on host port 5433 (see `docker-compose.yml`,
   quoted in full in section 4).
4. `npm run db:migrate` — applies `prisma/migrations/20260916111844_init_auth/migration.sql` and
   regenerates the Prisma Client into `src/generated/prisma`.
5. `npm run dev` — the app is now at `http://localhost:3001`, redirecting `/` to `/dashboard`.

---

## 3. User flow, screen by screen

### /sign-up
- **Page file:** `src/app/(auth)/sign-up/page.tsx` (client component)
- **User does:** fills in Name, Email, Password; submits.
- **Request:** `POST /api/auth/signup`, headers `Content-Type: application/json` and
  `Idempotency-Key: <crypto.randomUUID(), generated once when the form mounts>`. Body:
  `{ name: string, email: string, password: string }`.
- **Handler file/function:** `src/app/api/auth/signup/route.ts`, `POST`.
- **What the server does, in order:**
  1. `assertSameOrigin(request)` — 403 if `Origin` present and mismatched.
  2. `consume(\`signup:ip:${ip}\`, authConfig.rateLimits.signupPerIp)` — 429 if exceeded.
  3. Parse JSON; `signUpSchema.safeParse` — 400 with field errors if invalid.
  4. `withIdempotency("signup", request, parsed.data, handler)` — replays a prior response for a
     reused key+body; 422 for a reused key with a different body; 409 for one already processing.
  5. Inside the handler: `hashPassword(password)` (argon2id), `generateVerificationCode()`.
  6. One `db.$transaction`: create the `User` row, then create its `EmailVerificationCode` row.
  7. On a unique-email collision (Prisma `P2002`): return 409 `EMAIL_TAKEN` (not thrown, so the
     idempotency layer stores it as a replayable completed response).
  8. After the transaction commits: `sendVerificationCode(email, name, code)`.
  9. `createSession(userId)` then `setSessionCookie(token, expiresAt)`.
- **Response:** `201 { user: { name, email }, next: "/verify-email" }`, with `Set-Cookie` for the
  new session.

### /verify-email
- **Page file:** `src/app/(auth)/verify-email/page.tsx` (server component; redirects to
  `/sign-in` if no session, to `/dashboard` if already verified) rendering
  `src/app/(auth)/verify-email/VerifyEmailForm.tsx` (client).
- **User does:** enters the 6-digit code from their email; may click "Resend code".
- **Request:** `POST /api/auth/verify-email`, `Content-Type: application/json`, cookie only (no
  Idempotency-Key). Body: `{ code: string }` (regex `^\d{6}$`).
- **Handler file/function:** `src/app/api/auth/verify-email/route.ts`, `POST`.
- **What the server does, in order:**
  1. `assertSameOrigin`.
  2. `validateSession()` — 401 if none.
  3. `user.emailVerifiedAt !== null` → 400 `ALREADY_VERIFIED`.
  4. `consume(\`verify:user:${user.id}\`, authConfig.rateLimits.verifyPerUser)`.
  5. Parse/validate body.
  6. One atomic `UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = ...
     AND attempts < maxAttempts AND expires_at > now() RETURNING code_hash, attempts`.
  7. If no row returned: a follow-up `SELECT` decides between `CODE_INVALID` (no row),
     `CODE_EXPIRED`, or `TOO_MANY_ATTEMPTS`.
  8. If a row returned: `safeEqualHex(hmacCode(code), codeHash)`; mismatch → 400 `CODE_INVALID`
     with attempts remaining in the message text.
  9. Match: one `db.$transaction([...])` sets `emailVerifiedAt = now()` and deletes the code row.
- **Response:** `200 { next: "/dashboard" }` on success.
- **Resend button:** `POST /api/auth/resend-code`, `{}` body, no Idempotency-Key. Handler:
  `src/app/api/auth/resend-code/route.ts`. Order: origin check, session check,
  `ALREADY_VERIFIED` check, `consume(resendPerUser)`, then one conditional
  `UPDATE ... WHERE last_sent_at <= now() - cooldown` (atomic cooldown+replace); on 0 rows,
  either inserts a first-ever code row or returns a 429 with `Retry-After` computed from the
  existing row's `last_sent_at`. Success: `200 { cooldownSeconds }`.

### /sign-in
- **Page file:** `src/app/(auth)/sign-in/page.tsx` (server, wraps in `<Suspense>`) rendering
  `src/app/(auth)/sign-in/SignInForm.tsx` (client).
- **User does:** enters email and password; submits.
- **Request:** `POST /api/auth/signin`, `Content-Type: application/json`, no Idempotency-Key.
  Body: `{ email: string, password: string }`.
- **Handler file/function:** `src/app/api/auth/signin/route.ts`, `POST`.
- **What the server does, in order:**
  1. `assertSameOrigin`.
  2. `consume(\`signin:ip:${ip}\`, signinPerIp)`.
  3. Parse/validate body.
  4. `consume(\`signin:ip-email:${ip}:${email}\`, signinPerIpEmail)`.
  5. `db.user.findUnique({ where: { email } })`.
  6. `verifyPassword(user?.passwordHash ?? (await getDummyHash()), password)` — always runs,
     even for a nonexistent email, against a cached dummy argon2id hash, for constant-time
     behavior regardless of account existence.
  7. `!user || !passwordOk` → 401 `INVALID_CREDENTIALS` (identical message either way).
  8. `createSession` + `setSessionCookie`.
- **Response:** `200 { next: user.emailVerifiedAt ? "/dashboard" : "/verify-email" }`.

### /forgot-password
- **Page file:** `src/app/(auth)/forgot-password/page.tsx` (client).
- **User does:** enters their email; submits.
- **Request:** `POST /api/auth/forgot-password`, `Content-Type: application/json`, no
  Idempotency-Key. Body: `{ email: string }`.
- **Handler file/function:** `src/app/api/auth/forgot-password/route.ts`, `POST`.
- **What the server does, in order:**
  1. `assertSameOrigin`.
  2. `consume(\`forgot:ip:${ip}\`, forgotPerIp)`.
  3. Parse/validate body.
  4. `consume(\`forgot:email:${email}\`, forgotPerEmail)`.
  5. Schedules `after(async () => {...})`: looks up the user; if found, deletes their unused
     reset tokens, creates a new one, and emails the link — all AFTER the response is sent.
  6. Returns the generic message immediately, before step 5 runs.
- **Response:** always `200 { message: "If an account exists for that email, we've sent a
  password reset link." }`, whether or not the account exists.

### /reset-password?token=...
- **Page file:** `src/app/(auth)/reset-password/page.tsx` (server; missing token renders a
  message + link, no form) rendering
  `src/app/(auth)/reset-password/ResetPasswordForm.tsx` (client) when a token is present.
- **User does:** enters a new password twice; submits.
- **Request:** `POST /api/auth/reset-password`, `Content-Type: application/json`, no
  Idempotency-Key. Body: `{ token: string, password: string, confirmPassword: string }`.
- **Handler file/function:** `src/app/api/auth/reset-password/route.ts`, `POST`.
- **What the server does, in order:**
  1. `assertSameOrigin`.
  2. `consume(\`reset:ip:${ip}\`, resetPerIp)`.
  3. Parse/validate body (`resetPasswordSchema` also checks `password === confirmPassword`).
  4. `tokenHash = sha256Hex(token)`; `findFirst` where `tokenHash`, `usedAt: null`,
     `expiresAt: { gt: now }` — none found → 400 `TOKEN_INVALID_OR_EXPIRED`.
  5. `hashPassword(password)`.
  6. One `db.$transaction`: conditional `UPDATE password_reset_tokens SET used_at = now() WHERE
     id = ... AND used_at IS NULL` (must affect exactly 1 row, else abort), then
     `user.update({ passwordHash })`, then `invalidateAllUserSessions(userId, tx)`.
- **Response:** `200 { next: "/sign-in?reset=success" }`.

### Dashboard
- **Page file:** `src/app/dashboard/page.tsx` (server component).
- **User does:** nothing to submit — views their name, clicks "Sign out".
- **Protection:** `src/proxy.ts` (matcher `["/dashboard", "/verify-email"]`) redirects to
  `/sign-in?next=<path>` if the session cookie is entirely absent; the page itself then calls
  `getCurrentUser()` — no user → `redirect("/sign-in")`; unverified → `redirect("/verify-email")`.
- **Content:** `<p>You are signed in as {user.name}.</p>` plus `<SignOutButton />`.
- **Sign-out request:** `POST /api/auth/signout` (from `src/app/dashboard/SignOutButton.tsx`), no
  body needed. Handler: `src/app/api/auth/signout/route.ts`. Order: `assertSameOrigin`,
  `validateSession()`, `invalidateSession(session.id)` if one exists, `clearSessionCookie()`
  unconditionally. Response: always `200 { next: "/sign-in" }`.

---

## 4. Prisma schema, migration SQL, and constraint list

**Full `prisma/schema.prisma`:**
```prisma
// The connection URL lives in prisma.config.ts (Prisma 7 no longer reads it here).
// snake_case table/column names via @@map/@map so the SQL layer reads naturally in psql;
// Prisma Client still exposes the usual camelCase field names in TypeScript.

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  // gen_random_uuid() is a Postgres 18 built-in (no extension needed); giving it a real
  // database default means the row is valid even if inserted by something other than Prisma.
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  // Stored trimmed and lowercased by the app; CHECK (email = lower(btrim(email))) below is the
  // actual guarantee, since a raw SQL script or a future bug in the app can't bypass a CHECK.
  email String @unique

  // Display name shown on the dashboard; length bounds enforced by a CHECK below.
  name String

  // Argon2id's own encoded output ("$argon2id$v=19$...") is a self-describing text string,
  // not fixed-width, so it can't be a fixed-length or binary column.
  passwordHash String @map("password_hash")

  // Null = not verified yet; a timestamp = verified at that instant. This nullable timestamp
  // IS the verified flag (is-verified == emailVerifiedAt IS NOT NULL) -- no separate boolean,
  // so there is nothing for a boolean and a timestamp to disagree about.
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  // @default(now()) makes the column correct even for a row Prisma didn't create;
  // @updatedAt makes Prisma Client bump it on every update through the client.
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  sessions               Session[]
  emailVerificationCode  EmailVerificationCode?
  passwordResetTokens    PasswordResetToken[]

  @@map("users")
}

model Session {
  // The SHA-256 hex hash of the session token, not a UUID: the raw token lives only in the
  // cookie, so a leaked database row can never be replayed as a live session.
  id String @id

  userId String @map("user_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // No expiry would mean a session that never ends; enforces the 7-day fixed lifetime.
  expiresAt DateTime @map("expires_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Looking up / revoking all of one user's sessions is a lookup by user_id.
  @@index([userId])
  @@map("sessions")
}

model EmailVerificationCode {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  // UNIQUE enforces "at most one live code per user" at the database level: a resend
  // updates this row in place, it never inserts a second one alongside the old code.
  userId String @unique @map("user_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // NOT a plain SHA-256 of the code: a 6-digit code has only 1,000,000 possible values, so all
  // of them can be hashed and compared in under a second -- plain SHA-256 would give an
  // attacker with read access to this table a way to recover the live code. This column stores
  // HMAC-SHA256(code) keyed with AUTH_SECRET (see src/lib/auth/tokens.ts), which nobody can
  // brute-force offline without also knowing the server's secret key.
  codeHash String @map("code_hash")

  // Enforces the 10-minute TTL; CHECK expires_at > created_at below blocks a code born
  // already-expired.
  expiresAt DateTime @map("expires_at") @db.Timestamptz

  // Wrong guesses so far; CHECK attempts >= 0 below blocks a negative count (which would
  // effectively grant extra guesses against the max-attempts limit).
  attempts Int @default(0)

  // Server-side source of truth for the 60-second resend cooldown; distinct from createdAt
  // because a resend updates this in place without changing when the code was first created.
  lastSentAt DateTime @map("last_sent_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@map("email_verification_codes")
}

model PasswordResetToken {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  // Not unique: an older used/expired token can still exist when a new one is issued.
  // The forgot-password route deletes the user's previous UNUSED tokens on each new request.
  userId String @map("user_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // UNIQUE because the reset request (POST, with the token in the body) looks up a row by
  // this hash; a hash collision must never let one token match two rows.
  tokenHash String @unique @map("token_hash")

  // Enforces the 30-minute TTL; CHECK expires_at > created_at below blocks a token born
  // already-expired.
  expiresAt DateTime @map("expires_at") @db.Timestamptz

  // Null = still usable; a timestamp = already consumed. The handler checks used_at IS NULL
  // before honoring the token, then sets it, making the token single-use.
  usedAt DateTime? @map("used_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([userId])
  @@map("password_reset_tokens")
}

model RateLimitBucket {
  // Identifies what's being limited, e.g. "signin:ip:203.0.113.5".
  key String

  // Start of this fixed counting window (per windowSeconds in src/config/auth.ts).
  windowStart DateTime @map("window_start") @db.Timestamptz

  // Attempts seen in this window; CHECK count > 0 below blocks a pointless zero/negative row.
  count Int

  // Composite PK: "increment this window's counter" is one upsert keyed on the exact pair,
  // so two counters for the same key+window can never both exist.
  @@id([key, windowStart])
  @@map("rate_limit_buckets")
}

model IdempotencyKey {
  // Same key can legitimately be reused across different endpoints, so the PK is the pair,
  // not `key` alone.
  scope String
  key   String

  // SHA-256 of the normalised request body; comparing this on a retry is what turns "same
  // key, different body" into a 422 rather than silently replaying the wrong response.
  requestHash String @map("request_hash")

  // CHECK status IN ('processing', 'completed') below: a request is either still being
  // worked on, or done -- any other string is a state the handler has no branch for.
  status String

  // Null while processing -- there is no response yet to store.
  responseStatus Int? @map("response_status")

  // Json maps to Postgres jsonb by default for this provider: stores the parsed JSON value
  // (not the exact original bytes -- Postgres may reorder keys / drop insignificant
  // whitespace), which is enough to reconstruct and re-serve an equivalent response.
  responseBody Json? @map("response_body")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Enforces the 24-hour retention from config; a later cleanup job deletes rows past this.
  expiresAt DateTime @map("expires_at") @db.Timestamptz

  @@id([scope, key])
  @@map("idempotency_keys")
}
```

**Full migration SQL** (`prisma/migrations/20260916111844_init_auth/migration.sql`):
```sql
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
```

**`pg_constraint` counts, re-verified live for this document:**
```sql
SELECT con.contype AS type, count(*)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN ('users','sessions','email_verification_codes','password_reset_tokens','rate_limit_buckets','idempotency_keys')
GROUP BY con.contype ORDER BY con.contype;
```
```
 type | count
------+-------
 c    |     8   -- CHECK
 f    |     3   -- FOREIGN KEY
 n    |    31   -- attribute-level NOT NULL
 p    |     6   -- PRIMARY KEY
```
UNIQUE constraints (`users.email`, `email_verification_codes.user_id`,
`password_reset_tokens.token_hash`) are implemented as `CREATE UNIQUE INDEX`, not `pg_constraint`
rows (Prisma's `@unique` generates an index) — 3 of them, per the `CreateIndex` statements above.

---

## 5. The eight concepts

### Password hashing
- **Files/functions:** `src/lib/auth/password.ts` — `hashPassword()`, `verifyPassword()`.
- **Excerpt:**
```ts
const ARGON2ID = 2;
const argon2Options: Options = {
  algorithm: ARGON2ID,
  memoryCost: authConfig.argon2.memoryCost,
  timeCost: authConfig.argon2.timeCost,
  parallelism: authConfig.argon2.parallelism,
};
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, argon2Options);
}
```
- **Config values:** `authConfig.argon2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 }`
  (`src/config/auth.ts`).
- **Alternative recorded in DECISIONS.md:** none recorded specifically rejecting a different
  hashing algorithm; the AUTH_SECRET/HMAC decision (below, under "code and token expiry") is the
  adjacent hashing-related decision on record.

### Rate limiting
- **Files/functions:** `src/lib/security/rate-limit.ts` — `consume()`, `rateLimitResponse()`,
  `getClientIp()`.
- **Excerpt:**
```ts
const rows = await db.$queryRaw<{ count: number }[]>`
  INSERT INTO rate_limit_buckets (key, window_start, count)
  VALUES (${key}, ${windowStart}, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count
`;
```
- **Config values:** `authConfig.rateLimits` — 8 named limits, e.g.
  `signinPerIpEmail: { windowSeconds: 900, max: 5 }`, `signupPerIp: { windowSeconds: 3600, max: 5 }`
  (full list in section 4's schema section / `src/config/auth.ts`).
- **Alternative recorded in DECISIONS.md:** "Rate limiting: fixed window, not sliding window" —
  rejected a sliding window because it needs more than one row/statement per check; accepted
  trade-off is a client can burst up to 2x `max` across a window boundary.

### Client vs server validation
- **Files/functions:** `src/lib/validation/auth.ts` — `signUpSchema`, `signInSchema`,
  `verifyCodeSchema`, `forgotPasswordSchema`, `resetPasswordSchema`; imported directly by both
  the API routes (server) and the page components (client, via `useAuthForm`).
- **Excerpt:**
```ts
const email = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." }));
```
- **Config values:** `authConfig.password = { minLength: 8, maxLength: 128 }`.
- **Alternative recorded in DECISIONS.md:** none directly; the sign-in password schema's
  asymmetry (no minimum, a maximum) is explained inline in the schema file's own comment rather
  than in DECISIONS.md.

### Session management
- **Files/functions:** `src/lib/auth/session.ts` — `createSession()`, `setSessionCookie()`,
  `validateSession()`, `invalidateSession()`, `invalidateAllUserSessions()`.
- **Excerpt:** (full cookie-setting code is quoted in section 6)
- **Config values:** `authConfig.session = { lifetimeSeconds: 604800, cookieName:
  "auth_slice_session" }`.
- **Alternative recorded in DECISIONS.md:** no sliding/rolling session lifetime was implemented;
  `src/config/auth.ts`'s own comment states "Sessions last 7 days from sign-in, fixed: activity
  does not extend them" (no separate DECISIONS.md entry debating this choice).

### Code and token expiry in the database
- **Files/functions:** `email_verification_codes.expires_at`, `password_reset_tokens.expires_at`
  (both `prisma/schema.prisma`), checked in `src/app/api/auth/verify-email/route.ts` and
  `src/app/api/auth/reset-password/route.ts`.
- **Excerpt:**
```sql
CHECK (expires_at > created_at)
```
- **Config values:** `authConfig.verificationCode.ttlSeconds = 600`,
  `authConfig.passwordReset.tokenTtlSeconds = 1800`.
- **Alternative recorded in DECISIONS.md:** "Verification code hashing: HMAC-SHA256, not plain
  SHA-256" — rejected plain SHA-256 for the 6-digit code specifically because its low entropy
  (1,000,000 possibilities) makes an unkeyed hash brute-forceable in under a second.

### Idempotency
- **Files/functions:** `src/lib/security/idempotency.ts` — `withIdempotency()`.
- **Excerpt:**
```ts
if (existing.requestHash !== requestHash) {
  return errorResponse(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request body.");
}
```
- **Config values:** `authConfig.idempotency.retentionSeconds = 86400`;
  `MAX_IDEMPOTENCY_KEY_LENGTH = 128` (local constant in `idempotency.ts`, not in `authConfig`).
- **Alternative recorded in DECISIONS.md:** "Sign-up form's Idempotency-Key lifecycle" — rejected
  keeping one key for the form's entire lifetime, since a stored non-201 response would then
  block a corrected resubmit with `IDEMPOTENCY_KEY_REUSED`.

### Database constraints
- **Files/functions:** `prisma/schema.prisma`, `prisma/migrations/20260916111844_init_auth/migration.sql`.
- **Excerpt:**
```sql
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_trimmed" CHECK (email = lower(btrim(email)));
```
- **Config values:** none (constraints are fixed schema, not runtime-tunable).
- **Alternative recorded in DECISIONS.md:** "Database constraints (init_auth migration)" section
  lists all 21 constraints with the invalid state each blocks (quoted in full in section 7).

### Protected routes
- **Files/functions:** `src/proxy.ts` — `proxy()` (layer 1, cookie presence only);
  `src/app/dashboard/page.tsx` and `src/app/(auth)/verify-email/page.tsx` — both call
  `getCurrentUser()` (layer 2, real DB check); `src/lib/security/safe-redirect.ts` —
  `getSafeRedirectPath()` (open-redirect guard on `?next=`).
- **Excerpt:**
```ts
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(authConfig.session.cookieName);
  if (!hasSessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}
```
- **Config values:** `authConfig.session.cookieName = "auth_slice_session"` (the only value
  `proxy.ts` reads).
- **Alternative recorded in DECISIONS.md:** "Trusting X-Forwarded-For/X-Real-IP only behind a
  configured proxy" is adjacent (affects rate limiting on these routes, not the protection logic
  itself); no DECISIONS.md entry debates an alternative to the two-layer design itself.

---

## 6. Session creation and cookie details

**Session row created at** `src/lib/auth/session.ts`, function `createSession`, lines 14-25:
```ts
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + authConfig.session.lifetimeSeconds * 1000);

  // Only the hash is stored -- the raw token exists only in the cookie, so a database read
  // (backup, leaked dump) never hands out anything usable as a live session.
  await db.session.create({
    data: { id: sha256Hex(token), userId, expiresAt },
  });

  return { token, expiresAt };
}
```

**Cookie set at** `src/lib/auth/session.ts`, function `setSessionCookie`, lines 27-41:
```ts
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(authConfig.session.cookieName, token, {
    // JavaScript can never read this cookie, so it can't be exfiltrated by an XSS payload.
    httpOnly: true,
    // Only sent over HTTPS once deployed; in local dev there is no TLS to require.
    secure: process.env.NODE_ENV === "production",
    // Not sent on cross-site requests (e.g. a form on another site posting here); together
    // with assertSameOrigin this is the CSRF defence.
    sameSite: "lax",
    // Sent on every route in the app, not just the one that set it.
    path: "/",
    expires: expiresAt,
  });
}
```

**Every cookie attribute:**
| Attribute | Value | Set at |
|---|---|---|
| Name | `auth_slice_session` (`authConfig.session.cookieName`) | line 29 |
| Value | see below | line 29 |
| `HttpOnly` | `true` | line 31 |
| `Secure` | `true` only when `process.env.NODE_ENV === "production"` | line 33 |
| `SameSite` | `"lax"` | line 36 |
| `Path` | `"/"` | line 38 |
| `Expires` | the same `expiresAt` used for the database row (7 days from creation) | line 39 |

**What the cookie value actually contains:** the raw session token — `token` from
`generateSessionToken()` (`src/lib/auth/tokens.ts`: `randomBytes(authConfig.tokens.byteLength)
.toString("base64url")`, i.e. 32 random bytes, base64url-encoded, ~43 characters). The database
never stores this raw value — it stores `sha256Hex(token)` as the `sessions.id` primary key
(line 20 above). `validateSession()` (same file) reverses this on every request: reads the
cookie, computes `sha256Hex(token)`, and looks up `sessions` by that hash.

---

## 7. BUILD_LOG.md and DECISIONS.md, verbatim

### BUILD_LOG.md (full contents)

```markdown
# Build Log

Append-only. Every error, surprise or wrong assumption during the build. Raw material for DOCUMENTATION.md Section 6.

### create-next-app refuses to scaffold into a non-empty folder (2026-09-16 11:32)
- Symptom: `npx create-next-app@16.3.5 .` in the repo root exited 1 with "The directory auth-slice contains files that could conflict: AGENTS.md, BUILD_LOG.md, CLAUDE.md, DECISIONS.md". No files were written.
- Investigation: confirmed via `ls -la` that only the four rule/log files existed before the attempt and nothing changed after. Checked `create-next-app --help` for a force/overwrite flag; none exists for this case.
- Cause: create-next-app always refuses when the target directory is non-empty, regardless of which files are present.
- Fix: scaffolded into a temporary folder under the session scratchpad instead (`auth-slice-scaffold`, not a sibling of the repo, so the parent repo at C:\Users\HP\Documents\build-assessments was never touched), then copied the generated files in one by one, skipping AGENTS.md/CLAUDE.md/BUILD_LOG.md/DECISIONS.md/.git. `--no-agents-md` meant the scaffolder did not generate its own agent file, so nothing needed deleting there.
- Commit: (rolled into the scaffold commit)

### tsc --noEmit fails on a fresh checkout: "Cannot find name 'LayoutProps'" (2026-09-16 11:45)
- Symptom: `npm run typecheck` → `src/app/layout.tsx(9,50): error TS2304: Cannot find name 'LayoutProps'.`
- Investigation: checked next-env.d.ts, which imports `./.next/types/routes.d.ts`; `.next/` did not exist yet (`ls .next` → No such file or directory). Confirmed Next.js 16's typed-routes feature declares `LayoutProps<Route>` as a global type generated by `next dev`/`next build`, not by `next.js`'s static type declarations. Checked next.config.ts and tsconfig.json for a way to disable/pre-generate it; none applies without running dev/build first.
- Cause: I wrote `layout.tsx` using the generated `LayoutProps<"/">` type before ever running `next dev`/`next build`, so the type didn't exist yet. A standalone `typecheck` script (meant to run in CI or on a fresh clone without building first) can't depend on build output.
- Fix: switched `RootLayout`'s prop type to plain `{ children: React.ReactNode }`, which needs no generated types and works identically at runtime.
- Commit: (rolled into the scaffold commit)

### `prisma migrate dev` did not regenerate the client in Prisma 7.10 (2026-09-16 12:19)
- Symptom: after `npm run db:migrate` applied the `init_auth` migration and printed "Your database is now in sync with your schema", `src/generated/prisma/models/` was still empty (only the stale scaffold-time client from the empty schema existed; no `User.ts`, `Session.ts`, etc.).
- Investigation: compared file timestamps on `src/generated/prisma/*` before and after `db:migrate` — unchanged. `prisma migrate dev`'s own output had no "Generated Prisma Client" line this time, unlike the manual `prisma generate` run during scaffolding, which did print that line. Confirmed this isn't a caching issue by checking file contents (`models.ts` had no `User` reference).
- Cause: in earlier Prisma major versions, `migrate dev` always ran `generate` as its last step. In the installed 7.10.0, it does not (at least not with this config); the CLI's own `--help` for `migrate dev` doesn't document a flag for this either way.
- Fix: run `npx prisma generate` explicitly after every `migrate dev` from now on. Recommend making this a documented habit (or a follow-up: wire `generate` into `db:migrate` itself as `prisma migrate dev && prisma generate`) rather than relying on it happening implicitly.
- Commit: (rolled into the schema commit)

### Wrong claim: "hashed for the same leak-resistance reason as session tokens" applied to verification codes (2026-09-16 16:20)
- Symptom: the schema comment on `EmailVerificationCode.codeHash`, and my own report on that task, both stated plain SHA-256 hashing of the verification code was protective in the same way it is for session/reset tokens.
- Investigation: re-examined the actual entropy of what's being hashed. Session tokens and reset tokens are 32 random bytes (256 bits) — even knowing the hash, guessing the input is infeasible. The verification code is 6 decimal digits — only 1,000,000 possible values. Confirmed a plain SHA-256 of all 1,000,000 codes can be computed and compared to a stolen hash in well under a second on ordinary hardware, i.e. the hash gives no real protection for low-entropy input.
- Cause: I generalized "hash it, that's leak-resistant" from tokens to codes without checking that the argument depends on the input having enough entropy to resist brute force — codes don't.
- Fix: verification codes will be hashed with HMAC-SHA256 keyed by a server-only secret (`AUTH_SECRET`) instead of plain SHA-256, closing the brute-force gap since the attacker needs the secret, not just the hash. Corrected the schema.prisma comment and added a DECISIONS.md entry explaining the distinction. Implemented in `src/lib/auth/tokens.ts` as part of task A1.3.
- Commit: 94598e4

### tsc fails on @node-rs/argon2's Algorithm enum: "Cannot access ambient const enums when 'isolatedModules' is enabled" (2026-09-16 16:57)
- Symptom: `npm run typecheck` → `src/lib/auth/password.ts(5,14): error TS2748: Cannot access ambient const enums when 'isolatedModules' is enabled.`, pointing at `Algorithm.Argon2id`.
- Investigation: confirmed `Algorithm` is declared `export declare const enum Algorithm { ... Argon2id = 2 }` in `@node-rs/argon2`'s `.d.ts`. `create-next-app`'s generated tsconfig.json sets `isolatedModules: true` (required by Next's per-file compilation), which TypeScript disallows combining with referencing an ambient const enum by name, since the compiler can't verify the enum's values without full-program knowledge. Checked whether the library exports a runtime object instead: `require('@node-rs/argon2').Algorithm.Argon2id` does return `2` at runtime, so the enum exists as a value, just not in a form `tsc` will let this project reference by name.
- Cause: a version-specific interaction between this project's Next.js-mandated `isolatedModules` setting and how this native (napi-rs) package declares its enum.
- Fix: use the literal `2` with a comment citing the library's own declaration, instead of `Algorithm.Argon2id`.
- Evidence the literal is actually argon2id, not some other algorithm: hashed a sample password with `hashPassword()` and printed the first 30 characters of the result: `$argon2id$v=19$m=19456,t=2,p=1` -- matches the configured memoryCost (19456), timeCost (2), and parallelism (1) from src/config/auth.ts exactly.
- Commit: 92db117

### Wrong verification query: cross join always reads 0 if any one table is empty (2026-09-16 17:40)
- Symptom: my own suggested manual-verification command, `SELECT count(*) FROM users, rate_limit_buckets, idempotency_keys`, was presented as proof all three tables are empty after cleanup.
- Investigation: re-read what that query actually does. `FROM a, b, c` with no join condition is an implicit CROSS JOIN -- it returns one row per combination of rows across all three tables, so `count(*)` is `rows(a) * rows(b) * rows(c)`. If even one of the three tables has zero rows, the product is 0 regardless of how many rows the other two have -- the query can't distinguish "all three empty" from "two have data, one is empty".
- Cause: I wrote a query that looked like a plain row count without checking what a comma-separated FROM list actually computes.
- Fix: use one query with a separate scalar subquery per table -- `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM rate_limit_buckets) AS rate_limit_buckets, (SELECT count(*) FROM idempotency_keys) AS idempotency_keys` -- which reports each table's count independently. Re-ran it: all three genuinely read 0.
- Commit: 764500d

### `next dev` auto-appends a block to AGENTS.md on every start (2026-09-16 18:36)
- Symptom: while testing the A1.4 routes, `npm run dev`'s log printed "Generated AGENTS.md for AI agents. Set `agentRules: false` in next.config to disable." `git status` immediately showed AGENTS.md as modified.
- Investigation: `git diff AGENTS.md` showed the file's own content untouched, with a new block appended at the end between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` markers, generated by `node_modules/next/dist/server/lib/generate-agent-files.js` (the block's own comment names this file and says it is "re-added by `next dev`" on every start). Confirmed this is a genuine Next.js 16 feature, not file corruption -- the earlier `--no-agents-md` flag passed to `create-next-app` during scaffolding only skipped *creating* an initial one; it does not stop the dev server from appending to an existing one at runtime.
- Cause: Next.js 16 defaults to keeping an "AGENTS.md" section up to date for AI coding agents, which conflicts with this project's own AGENTS.md being a fixed, owner-authored contract that every task starts by reading verbatim (see the many "confirm AGENTS.md/CLAUDE.md unchanged" checks earlier in this project's history).
- Fix: set `agentRules: false` in next.config.ts (the log message's own suggested fix) and reverted the appended block with `git checkout -- AGENTS.md`.
- Commit: 60daa80

### zodResolver's generics don't accept a schema typed through a generic type parameter (2026-09-17 14:15)
- Symptom: `tsc --noEmit` on `src/components/auth/useAuthForm.ts` (the shared form hook, written to accept any of the schemas in src/lib/validation/auth.ts through a generic `TInput`) failed with `No overload matches this call` against `zodResolver`'s `Zod3Type<TInput, FieldValues>` / `Zod4Type<unknown, FieldValues>` overloads, and every screen calling `useAuthForm` then failed too with "Type 'TFieldValues' is not assignable to type '{ email: string; ... }'" on their `handleSubmit(onSubmit)` calls.
- Investigation: confirmed `@hookform/resolvers/zod`'s `zodResolver` is built to INFER its generic parameters from a concrete schema passed directly at the call site, not to accept a schema whose type is itself an unresolved generic type parameter (`ZodType<TInput>` where `TInput` isn't concrete yet). Tried narrowing `useAuthForm`'s `schema` parameter type several ways (`ZodType<TInput, ZodTypeDef, TInput>`-style annotations); none satisfied both of `zodResolver`'s overloads simultaneously, because the overloads themselves disagree on where `FieldValues` needs to appear.
- Cause: a structural mismatch between "a hook generic enough to wrap any of our schemas" and a resolver library designed around inference at a single, concrete call site -- not a bug in either library, just two designs that don't compose directly.
- Fix: cast only at the `zodResolver(schema as any)` call itself, then cast its result to `Resolver<TInput>` -- the type-unsafe step is contained to that one line (with a comment explaining why), while `useAuthForm`'s actual public API (`form`, `submit`, etc.) stays fully typed for every caller.
- Commit: 08ebee5

### Two real bugs found during the A1.7 strict review (2026-09-17 18:31)
- Symptom: (1) `rate-limit.ts`'s opportunistic cleanup was called as `void cleanupOldBucketsOncePerInterval()` with no `.catch()`, and the function itself had no internal try/catch -- a failed `deleteMany` (e.g. a DB blip) would have been an unhandled promise rejection on nearly every mutating request, since `consume()` runs on every rate-limited route. (2) `SignOutButton`'s `onClick` was `try { ... } finally { ... }` with no `catch` -- a network failure during sign-out propagated out of the click handler uncaught, silently leaving the user with no feedback (the button just stopped showing "Signing out…").
- Investigation: found by reading both functions end-to-end while auditing for "any promise that isn't awaited or error that isn't handled" per the A1.7 review. Confirmed neither had a code path that could report or recover from a rejection.
- Cause: both were written assuming the underlying call (`deleteMany`, `fetch`) would simply succeed; neither considered the failure path explicitly.
- Fix: wrapped the cleanup body in try/catch with `console.error`; added a `catch` to `SignOutButton` that shows a `FormAlert`-style message ("Couldn't sign out. Check your connection and try again.") and re-enables the button.
- Commit: 98e59af

### `npm run db:studio` opened a different project's database (2026-09-17 19:43)
- Symptom: Prisma Studio showed tables (`plan`, `creditBalance`, `Job`, `PaymentLog`, `Subscription`, `Transaction`) and bcrypt password hashes that don't exist anywhere in this project's schema.prisma -- clearly a different project's data ("Notebound").
- Investigation: confirmed `docker-compose.yml` maps this project's Postgres to host port 5433, and `docker ps` showed a separate `notebound-postgres` container on port 5432. Confirmed `prisma.config.ts` has no hardcoded connection string -- it only reads `process.env.DATABASE_URL` via `dotenv/config`. Traced the actual cause to a `DATABASE_URL` environment variable left set at the PowerShell session level from earlier work in the Notebound project; a shell-level environment variable takes precedence over a value loaded from `.env` by `dotenv`, so Prisma silently connected to port 5432 (Notebound) instead of 5433 (this project) without any error.
- Cause: a stale shell-level `DATABASE_URL` from another project silently overrode this project's `.env`. Not a bug in this repo -- `prisma.config.ts` reads `process.env.DATABASE_URL` exactly as designed; the environment simply had the wrong value in it from a previous, unrelated session.
- Fix: none needed in code. The owner closed the stale terminal and opened a fresh one inside `auth-slice` with no `DATABASE_URL` preset, confirmed via `echo $env:DATABASE_URL` printing nothing.
- Commit: 994caa4

### Prisma Studio showed another project's data, part 2: a port collision, not a config bug (2026-09-17 19:59)
- Symptom: after closing the stale terminal and confirming `DATABASE_URL` was unset, `npm run db:studio` still showed Notebound's tables (`plan`, `creditBalance`, `Job`, `PaymentLog`, `Subscription`, `Transaction`) and bcrypt hashes.
- Investigation: checked every plausible cause read-only, in order -- the exact shell process and working directory (`Get-Process`, `Get-Location`), every `DATABASE`-named environment variable in that process (none), every `.env*` file anywhere under `auth-slice` (only `.env` and `.env.example`, no stray `.env.local` or second copy), every reference to `DATABASE_URL` in the codebase for a hardcoded `??`/`||` fallback (none -- only two direct reads, in `prisma.config.ts` and `src/lib/db.ts`), the exact `db:studio` launch command (plain `prisma studio`, no wrapper), and whether any `postinstall` script could set env vars first (no `postinstall` script exists at all). All of it came back clean, which was itself the clue that the problem wasn't in this repo's config at all.
- Cause: `prisma studio` picks an available port at random each time it starts (Prisma does not default to a fixed port). Two unrelated projects (`auth-slice` and Notebound) each ran their own Prisma Studio instance around the same time, and both happened to bind to the identical port (51212). Whichever server claimed that port first silently answered every request sent to it -- the browser was pointed at the correct URL the whole time, but the wrong project's server was listening behind it. This is why the extensive config/env investigation found nothing: there was nothing wrong to find in auth-slice.
- Fix: closed Notebound's database, freeing the port; confirmed `auth-slice`'s Studio then showed the correct data. For future safety, pin this project's Studio to a fixed port (e.g. `prisma studio --port 5556`) so it can never randomly collide with another project's instance again.
- Commit: (this commit)
```

(This is the current, final text of `BUILD_LOG.md` at the time this facts pack was written — the
entry's own "Commit: (this commit)" placeholder was never filled in with a hash, unlike earlier
entries in the same file that were corrected after their commit landed. The actual fix for the
port collision itself is commit `4929a98`, recorded separately in DECISIONS.md, not in this
BUILD_LOG entry.)

### DECISIONS.md (full contents)

```markdown
# Decisions

## Decisions

### Node runtime version
- Decision: which Node version to build on.
- Chosen: Node v26.3.1, already installed.
- Note: Node v26.3.1 (Current, not LTS) is in use. If a dependency fails to install or a native module errors, suspect the Node version first and report it before attempting workarounds.
- Rejected and why: installing Node 20 or 22 LTS alongside it — rejected for now because it means a global toolchain change, and AGENTS.md forbids installing or upgrading globally without asking. Revisit if `@node-rs/argon2` or Prisma's engines fail to build.
- Files: none. Deliberately no `engines` field was ever added to package.json: Node 26 is not an LTS release, so pinning `engines` to it would document a version nobody should actually deploy on; there is no CI in this project to enforce an `engines` constraint against either. Revisit this if the project moves to a Node LTS release or gains CI.

### Repository layout
- Decision: whether auth-slice is its own repository or a folder inside the parent repo at C:\Users\HP\Documents\build-assessments.
- Chosen: standalone repository at auth-slice/, initialised with its own .git.
- Rejected and why: committing into the parent repo — rejected because the owner wants this assessment to be reviewable on its own. The parent repo is to be left completely untouched: no commits, no .gitignore edits, no git commands run from it.
- Files: .git/, .gitignore

### Default branch name
- Decision: default branch name for this repository.
- Chosen: main.
- Rejected and why: master, which `git init` produced by default — renamed to match the owner's other repository and the common GitHub default.
- Files: (none)

### Dev server port
- Decision: which port the Next.js dev/start servers run on.
- Chosen: 3001, hardcoded into the `dev` and `start` npm scripts (`next dev -p 3001` / `next start -p 3001`), matching `APP_URL` in .env.example.
- Rejected and why: the Next.js default, port 3000 — rejected because another local project already listens on 3000. Hardcoding the port (rather than leaving it to chance or an env var) keeps APP_URL and the running server always in agreement.
- Files: package.json, .env.example

### GitHub repository for this slice
- Decision: GitHub repository for this slice.
- Chosen: deleted a superseded one-commit draft repo of the same name (draft still preserved locally in the parent folder at 38fcc62), removed the parent folder's stale remote, and created a fresh auth-slice repo.
- Rejected and why: merging unrelated histories (confusing history for reviewers); force-pushing over the draft; a different repo name (inconsistent naming across the four assessments).
- Files: (none in this repo; parent folder's .git/config lost its `origin` remote)

### Database constraints (init_auth migration)
Totals, verified directly against `pg_constraint`/`pg_indexes` on 2026-09-16: 6 models in
schema.prisma, 6 PRIMARY KEY, 3 FOREIGN KEY, 3 UNIQUE (as unique indexes, since `@unique`
generates `CREATE UNIQUE INDEX` rather than a `pg_constraint` unique row), 8 CHECK. No 4th
foreign key exists.

Each constraint below and the invalid state it exists to block. Evidence that the eight CHECK
constraints actually fire: docs/evidence/constraints.md.

- `users_pkey` (PRIMARY KEY on `id`) — blocks a user row with no identity, or two rows sharing one id.
- `users_email_key` (UNIQUE on `email`) — blocks two accounts claiming the same address.
- `users_email_lowercase_trimmed` (CHECK `email = lower(btrim(email))`) — blocks two visually-identical addresses (different case, or surrounding whitespace) from coexisting as distinct rows; the UNIQUE constraint alone would let `Foo@Bar.com` and `foo@bar.com` both exist.
- `users_name_length` (CHECK `char_length(name) BETWEEN 1 AND 80`) — blocks an empty display name (NOT NULL alone allows `''`) and an unbounded one that could break the dashboard layout or abuse storage.
- `sessions_pkey` (PRIMARY KEY on `id`, the session token's SHA-256 hash) — blocks two sessions colliding on the same hash, which for SHA-256 in practice means blocking accidental duplicate inserts of the same token.
- `sessions_user_id_fkey` (FOREIGN KEY `user_id` → `users.id` ON DELETE CASCADE) — blocks a session pointing at a user that doesn't exist; CASCADE means a deleted user can never leave orphaned sessions behind.
- `email_verification_codes_pkey` (PRIMARY KEY on `id`) — blocks two verification codes sharing one identity.
- `email_verification_codes_user_id_key` (UNIQUE on `user_id`) — blocks a second live verification code existing for a user who already has one; a resend must update the existing row, never insert alongside it.
- `email_verification_codes_user_id_fkey` (FOREIGN KEY, ON DELETE CASCADE) — blocks a code pointing at a nonexistent user; cascades cleanup on user deletion.
- `email_verification_codes_attempts_non_negative` (CHECK `attempts >= 0`) — blocks a negative attempt count, which would effectively grant extra guesses beyond the configured max-attempts limit.
- `email_verification_codes_expires_after_created` (CHECK `expires_at > created_at`) — blocks a code that is born already-expired (e.g. a bug passing a negative TTL), which would silently reject every verification attempt with no visible cause.
- `password_reset_tokens_pkey` (PRIMARY KEY on `id`) — blocks two reset tokens sharing one identity.
- `password_reset_tokens_token_hash_key` (UNIQUE on `token_hash`) — blocks a hash collision letting one submitted token match two different rows, which would make "which user does this reset?" ambiguous.
- `password_reset_tokens_user_id_fkey` (FOREIGN KEY, ON DELETE CASCADE) — blocks a token pointing at a nonexistent user; cascades cleanup on user deletion. Not UNIQUE on `user_id`: an older used/expired token can still exist when a new one is issued, because the forgot-password route deletes only the user's previous *unused* tokens on each new request, not all history.
- `password_reset_tokens_expires_after_created` (CHECK `expires_at > created_at`) — blocks a token born already-expired, same reasoning as verification codes.
- `rate_limit_buckets_pkey` (PRIMARY KEY on `(key, window_start)`) — blocks two counters existing for the same key in the same window; "increment this bucket" is always a single, unambiguous upsert target.
- `rate_limit_buckets_count_positive` (CHECK `count > 0`) — blocks a bucket row with a zero or negative count, which would either be pointless (a bucket only exists once something happened) or signal a subtraction bug that should fail loudly, not silently under-count attempts.
- `idempotency_keys_pkey` (PRIMARY KEY on `(scope, key)`) — blocks the same client-supplied key colliding across two different endpoints; each scope gets its own key space.
- `idempotency_keys_status_valid` (CHECK `status IN ('processing', 'completed')`) — blocks any status value the handler code has no branch for.
- `idempotency_keys_completed_has_response` (CHECK `status = 'processing' OR (response_status IS NOT NULL AND response_body IS NOT NULL)`) — blocks a row marked completed with no stored response, which would make a replay of that idempotency key return nothing to a legitimately retrying client.
- Files: prisma/schema.prisma, prisma/migrations/20260916111844_init_auth/migration.sql

### Verification code hashing: HMAC-SHA256, not plain SHA-256
- Decision: how to hash the 6-digit email verification code before storing it in `email_verification_codes.code_hash`.
- Chosen: HMAC-SHA256 keyed with a server-only secret (`AUTH_SECRET`).
- Rejected and why: plain SHA-256, the same scheme used for session tokens and reset tokens — correct for those because a 32-random-byte token has 256 bits of entropy, infeasible to guess or brute-force even knowing only its hash. A 6-digit code has only 1,000,000 possible values; all of them can be hashed with plain SHA-256 and compared to a stolen hash in under a second, so plain SHA-256 gives a verification code no real protection. Keying the hash with a secret the attacker doesn't have (HMAC) closes that gap: brute-forcing now requires the secret, not just the hash.
- Files: src/lib/auth/tokens.ts, prisma/schema.prisma (comment on `EmailVerificationCode.codeHash`)

### Rate limiting: fixed window, not sliding window
- Decision: how `rate_limit_buckets` counts attempts within a time window.
- Chosen: fixed window — one row per `(key, window_start)`, incremented with a single atomic `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING count`.
- Rejected and why: a sliding window (e.g. a sorted set of timestamps, or two overlapping half-windows averaged together) gives smoother enforcement but needs more than one row and more than one statement per check. A fixed window needs exactly one row and one atomic statement per key, which is simpler to reason about and to verify. Known, accepted trade-off: a client can burst up to 2x `max` requests across a window boundary (e.g. `max` requests just before a window ends, then `max` more just after it starts) — accepted because this slice's rate limits exist to blunt scripted brute-forcing, not to provide an exact global cap, and the simplicity is worth that gap.
- Files: src/lib/security/rate-limit.ts

### forgot-password timing: deferred work via next/server's after()
- Decision: when to do the user lookup, token creation, and email send for forgot-password relative to sending the HTTP response.
- Chosen: respond 200 with the generic message immediately after validation and both rate limits pass, then do the lookup/token/email work inside `after()` (from `next/server`), which Next runs once the response has been flushed to the client. Errors inside it are caught and logged server-side only, since there's no client left to report them to.
- Rejected and why: doing that work inline, before responding — rejected because the account-exists branch does strictly more work (a delete, an insert, a network call to send an email) than the account-doesn't-exist branch (nothing), so the response time itself would leak whether the email is registered even though the response body is identical either way. Deferring the work until after the response is sent removes that timing signal entirely, since none of it can affect how long the client waited.
- Files: src/app/api/auth/forgot-password/route.ts

### Sign-up form's Idempotency-Key lifecycle
- Decision: when the sign-up form's `Idempotency-Key` (sent with every `POST /api/auth/signup`) should be regenerated versus reused.
- Chosen: generate one key when the form mounts; keep reusing that same key while a request is in flight or after a network failure (no response received at all); generate a fresh key only after receiving a FINAL server response that isn't 201 (400, 409, 422, 429, 500).
- Rejected and why: keeping one key for the form's entire lifetime — rejected because the server stores whatever response it gave against that key (see src/lib/security/idempotency.ts). If signup returns 409 EMAIL_TAKEN, that 409 is now permanently associated with the key; when the person corrects the email and resubmits with the same key, the request body has changed, so the server returns 422 IDEMPOTENCY_KEY_REUSED instead of actually trying the corrected signup — the person would be stuck unable to ever submit successfully from that page load. Rotating the key after any non-201 final response avoids this, while still keeping the SAME key across an in-flight request or a network failure, which is exactly the case idempotency exists to protect (a double-click, or a retry after "did that actually go through?").
- Files: src/app/(auth)/sign-up/page.tsx

### Trusting X-Forwarded-For/X-Real-IP only behind a configured proxy
- Decision: whether `getClientIp()` should trust the client-supplied `X-Forwarded-For`/`X-Real-IP` headers by default.
- Chosen: default to distrusting them (`TRUST_PROXY` unset or anything other than `"true"`). Every request is then treated as coming from the same constant `"direct"` identity for rate-limiting purposes. Only set `TRUST_PROXY=true` once actually deployed behind a proxy that sets these headers itself and strips any value a client tried to supply.
- Rejected and why: trusting the headers unconditionally (the original A1.4 implementation) — rejected because found during the A1.7 review: any client can put an arbitrary value in `X-Forwarded-For` and get a fresh rate-limit bucket on every single request, defeating the limiter entirely with zero effort.
- Effect of the fix, locally and in any deployment without `TRUST_PROXY=true`: `signupPerIp`, `forgotPerIp`, `resetPerIp`, and `signinPerIp` — the four limits keyed purely on IP — now share ONE bucket across every visitor, since everyone is `"direct"`. This makes them effectively global caps rather than per-visitor ones until deployed behind a real proxy, which is an intentional, safer default than the alternative (a limit that looks like it's working but isn't). `signinPerIpEmail`, `forgotPerEmail`, `resendPerUser`, and `verifyPerUser` are unaffected either way, since none of them depend on the IP portion of their key alone (they're combined with, or entirely based on, the account/email/user).
- Files: src/config/auth.ts, src/lib/security/rate-limit.ts, .env.example

### CSRF: allowing a request with no Origin header at all
- Decision: what `assertSameOrigin` should do when the `Origin` header is entirely absent, found worth an explicit decision during the A1.7 review.
- Chosen: allow the request through (no error) when `Origin` is missing, only rejecting when it's present and doesn't match `APP_URL`'s origin.
- Rejected and why: rejecting whenever `Origin` is absent — rejected because browsers always send `Origin` on a cross-site POST (fetch, XHR, or a cross-site `<form>` submission), which is exactly the request shape a CSRF attempt needs; a same-origin request or a request from a non-browser tool like `curl` may simply not include it, and neither of those is the attack this check exists to stop. A forged cross-site request is still rejected either way, because `SameSite=Lax` on the session cookie (src/lib/auth/session.ts) is the primary defence: it stops the cookie ever being attached to a cross-site POST before this check even runs, so such a request arrives with no valid session to act on regardless of what its Origin header says.
- Files: src/lib/security/origin.ts

### Keeping GET /api/auth/me
- Decision: whether to remove the `GET /api/auth/me` route found unused by any page during the A1.7 review.
- Chosen: keep it, specifically for verifying session state directly with `curl` in evidence files (e.g. docs/evidence/protected-routes.md-style checks) without needing to render a full page.
- Rejected and why: deleting it as dead code — rejected because it isn't dead in the sense that matters: it's a diagnostic tool for the curl-based verification this project relies on throughout, even though no page's UI calls it.
- Files: src/app/api/auth/me/route.ts

## Deliberately excluded
```

(`## Deliberately excluded` has no entries as of this document — nothing was ever considered
mid-task and rejected as out-of-scope; the "Never build" list in AGENTS.md pre-empted that need.)

---

## 8. Evidence index, with one-line results

From `docs/evidence/README.md`, with a factual result summary added for each:

| File | One-line result |
|---|---|
| `e1-users-hash.md` + `e1-users-hash.png` | Query returned `password_hash` = `$argon2id$v=19$m=194...` for the test user; `\d users` shows only `password_hash text NOT NULL`, no plain-password column. |
| `e2-signup-curl.md` | (a) 201 + `Set-Cookie`; (b) 400 with 3 field errors (name/email/password); (c) 201 then (after clearing an unrelated rate-limit bucket) 201 with `idempotent-replayed: true`, `SELECT count(*)` = 1; (d) 201 then 409 `EMAIL_TAKEN`, `SELECT count(*)` = 1. |
| `e3-rate-limits.md` | 6 wrong-password attempts → 401×5 then 429; the 429's `Retry-After: 134`; `resend-code` called twice inside cooldown → 429/`Retry-After: 20` both times; final `rate_limit_buckets` rows: `signin:ip-email:...` count 7, `signin:ip:direct` count 7, `resend:user:...` count 2. |
| `e4-code-expiry.md` + `e4-code-expired.png` | First attempt: `expired` flipped `f`→`t` after a genuine 10 min 15 sec wait, all other columns byte-identical; submitting the real code afterward → 400 `CODE_EXPIRED`. Second attempt (screenshot): live `expires_at < now()` query returned `true` after a second genuine wait. |
| `e5-reset-single-use.md` | First use → 200 `{next:"/sign-in?reset=success"}`; reuse of the same token → 400 `TOKEN_INVALID_OR_EXPIRED`; `password_reset_tokens.used_at` filled; sign-in with old password → 401; with new password → 200. |
| `e6-drift-check.md` | Re-ran `constraints.md` (8/8 CHECK constraints still present, no drift) and `protected-routes.md` (a/b/c all reproduced identically) after the A1.7 fixes; no functional drift found in either. |
| `env-check.txt` | `git ls-files \| grep -i env` → `.env.example` only. |
| `constraints.md` | (A1.2) All 21 constraints (6 PK, 3 FK, 3 UNIQUE, 8 CHECK, 1 attribute-NOT-NULL group) confirmed present; 4 negative-SQL-insert tests each produced the expected Postgres constraint-violation error, then were rolled back. |
| `api-smoke-test.md` | (A1.4) Every route exercised: 401 (no session), 403 (foreign Origin), 201 (signup), 400 (bad body), 409 (duplicate email), 400/200 (verify wrong/right code), 8-parallel-wrong-code race → attempts capped at exactly 5, 2-parallel-resend race → one 200 one 429, 401/200 (signin wrong/right), 200 (signout, twice), 200 (forgot-password, both branches identical), 200/400 (reset then reuse), 201/201-replayed/422 (idempotency key reuse variants). |
| `protected-routes.md` | (A1.6) No cookie → 307 to `/sign-in?next=...`; forged cookie → still 307 (layer 2 catches it); sign-out then replay old cookie → 307, `sessions` row confirmed deleted; `getSafeRedirectPath` script: all 8 malicious/malformed inputs fell back to `/dashboard`, only the genuine relative path passed through. |

**Argon2id hash timing:** measured freshly for this document via `npm run check:security` —
`hash() took 36ms` (this run's own database was left clean afterward; the script deletes its own
test rows).

---

## 9. Limitations

### Outside the brief's scope (per AGENTS.md's own "Never build" list)
- Landing or marketing page, profile editing, settings, social sign-in, two-factor
  authentication, dashboard features beyond the required name+sign-out, extra pages, theme
  toggles, animations.
- Anything not on AGENTS.md's five-screens-plus-dashboard list.
- True distributed/multi-instance rate limiting (a Redis-backed or similar limiter) — this
  project's Postgres-backed fixed-window limiter, with the documented 2x-burst-at-boundary
  trade-off, is what AGENTS.md's scope calls for.
- Automated test suite (Jest/Vitest/Playwright) — AGENTS.md's verification method throughout is
  manual `curl`/`psql` evidence, not an automated test runner; `package.json` has no `test`
  script.
- Production deployment configuration (hosting, TLS termination, a real reverse proxy) — the
  project is designed to be deployable (e.g. `TRUST_PROXY`, the `Secure` cookie flag keyed off
  `NODE_ENV`), but no such deployment exists or was configured.

### Not done for lack of time
- `README.md` still says "Full documentation: DOCUMENTATION.md", and no `DOCUMENTATION.md`
  exists in this repository yet — this facts pack is the material for writing it; the link will
  become accurate once that file is created from this pack.
- No CI pipeline runs `typecheck`/`lint`/`build` automatically on push; DECISIONS.md's own Node
  version entry notes "there is no CI in this project."
- `TRUST_PROXY=true` behavior (trusting `X-Forwarded-For` behind a real proxy) has never been
  exercised against an actual proxy — it's correct by code reading only, not by a live test,
  since this project has only ever run locally with `TRUST_PROXY` unset.
- The `Secure` cookie attribute (`NODE_ENV === "production"`) has never been observed on an
  actual `Set-Cookie` header — all manual walkthroughs in this project's evidence were run
  against `npm run dev`, never against `npm run build && npm run start` with `NODE_ENV=production`
  set.
- The opportunistic `rate_limit_buckets` cleanup sweep (`cleanupOldBucketsOncePerInterval`,
  gated to once per `authConfig.rateLimitCleanup.intervalSeconds` = 5 minutes) has never been
  observed actually firing and deleting old rows during this project's lifetime — all evidence
  sessions were shorter than its retention window (24 hours) and often shorter than its own
  5-minute gate.

---

## 10. `git log --oneline`, full

```
cc078d0 docs: assessment evidence screenshots
4929a98 fix(dev): pin Prisma Studio to a fixed port to prevent cross-project collisions
baf2822 docs: record Prisma Studio port collision root cause
994caa4 docs: note stale shell-level DATABASE_URL incident
82dbf2e docs: assessment evidence
9ab566c docs: correct stale entries and record review decisions
b895715 fix(ui): guard responses and add error and not-found pages
f9eeb7f refactor(config): centralise remaining tunables
5b83be5 fix(validation): bound sign-in password, reset token and idempotency key length
bef3ace fix(security): only trust forwarded IP headers behind a trusted proxy
98e59af fix: handle cleanup and sign-out failures
8a1734d feat(auth): protected dashboard with two-layer session check
08ebee5 feat(ui): accessible auth screens with shared validation
60daa80 feat(auth): signup, verification, signin, signout and password reset routes
764500d docs: log verification corrections
92db117 feat(auth): security core (hashing, sessions, rate limiting, idempotency, validation)
94598e4 fix(docs): correct verification code hashing rationale (HMAC, not SHA-256)
2abe5cd feat(db): auth schema with constraints
800b546 docs: record repository decision
a3fc3ee chore: scaffold next.js, prisma, postgres and config
75820ee chore: load AGENTS.md via CLAUDE.md
17a4273 docs: record Node version, repo layout and branch decisions
72241a6 chore: protect other local projects
bbc0665 chore: add agent rules, build log and decisions log
```
