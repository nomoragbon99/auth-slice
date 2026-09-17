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
