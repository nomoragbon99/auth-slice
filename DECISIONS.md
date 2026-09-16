# Decisions

## Decisions

### Node runtime version
- Decision: which Node version to build on.
- Chosen: Node v26.3.1, already installed.
- Note: Node v26.3.1 (Current, not LTS) is in use. If a dependency fails to install or a native module errors, suspect the Node version first and report it before attempting workarounds.
- Rejected and why: installing Node 20 or 22 LTS alongside it — rejected for now because it means a global toolchain change, and AGENTS.md forbids installing or upgrading globally without asking. Revisit if `@node-rs/argon2` or Prisma's engines fail to build.
- Files: (none yet; will affect package.json "engines" and any CI setup)

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

## Deliberately excluded
