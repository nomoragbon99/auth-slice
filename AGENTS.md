# AGENTS.md: Assessment 1, Authentication Slice

## What this repository is
A graded "slice": one working authentication flow, built properly, with nothing around it. A reviewer reads the code and DOCUMENTATION.md, then asks the owner to defend decisions line by line. Optimise for correctness and explainability, not cleverness or feature count. The owner is new to engineering: explain reasoning in plain language in every plan.

## Scope: build ONLY this
Screens: create account, sign in, forgot password (request form), reset password (form reached from the emailed link), email verification (6-digit code entry + resend control), placeholder dashboard (the signed-in user's name and a sign out button, nothing else). "/" redirects to /dashboard.

## Never build
Landing or marketing page, profile editing, settings, social sign-in, two-factor, dashboard features, extra pages, theme toggles, animations. If something seems useful but is not listed, do not build it: add one line under "Deliberately excluded" in DECISIONS.md.

## Stack
Next.js App Router + TypeScript (strict), Prisma + PostgreSQL (Docker Compose locally), Tailwind CSS, Zod, React Hook Form, @node-rs/argon2, Resend.
Use current stable versions. Before writing version-sensitive code (the Next.js request interceptor file name, async cookies()/headers(), Prisma config and client generation, Tailwind setup), check the INSTALLED version and its official docs. Never rely on memory of older versions.

## Folder conventions
- src/app/(auth)/            pages: sign-up, sign-in, verify-email, forgot-password, reset-password
- src/app/dashboard/         placeholder dashboard
- src/app/api/auth/**/route.ts   all auth mutations (Route Handlers, callable with curl)
- src/lib/validation/        Zod schemas shared by client and server
- src/lib/auth/              password.ts, tokens.ts, session.ts, email.ts
- src/lib/security/          rate-limit.ts, idempotency.ts, origin.ts
- src/lib/http.ts            JSON response and error helpers
- src/lib/db.ts              Prisma client singleton
- src/config/auth.ts         every tunable value
- docs/evidence/             evidence outputs and screenshots

## Engineering rules
1. Every input schema is declared ONCE in src/lib/validation and imported by the API route (authoritative) and the client form (feedback only). No hand-written checks scattered through handlers.
2. All auth mutations are Route Handlers under src/app/api. No Server Actions for auth.
3. All tunables (TTLs, cooldowns, rate-limit windows and maximums, hashing parameters, session lifetime) live in src/config/auth.ts. No magic numbers in handlers.
4. One error response shape: { "error": { "code": string, "message": string, "fields"?: Record<string, string[]> } }. Status codes: 400 validation, 401 unauthenticated, 403 forbidden (e.g. foreign Origin), 409 conflict, 422 idempotency key reused with a different body, 429 rate limited WITH a Retry-After header in seconds, 500 unexpected (generic message; details only in server logs).
5. Forgot-password and resend never reveal whether an email is registered.
6. Random secrets (session tokens, reset tokens, codes) come from Node's crypto module, never Math.random. Store only SHA-256 hashes of tokens and codes.
7. CHECK constraints Prisma cannot express are added by editing migration SQL created with `prisma migrate dev --create-only`, then applying it.
8. Raw SQL only through parameterised Prisma queries ($queryRaw tagged templates). Never string concatenation.
9. Small functions named for what they do. Comment the WHY, not the WHAT.

## Other projects on this machine
The owner has other projects using Docker, PostgreSQL and Prisma. Never run `docker system prune`, `docker volume prune`, `docker compose down -v`, or any command that stops, removes or modifies containers, volumes or databases not defined in THIS repository's docker-compose.yml. Never install or upgrade anything globally without asking.

## Secrets: non-negotiable
- Never create, open, read, print or edit `.env`. Maintain only `.env.example` with commented placeholders.
- If a new environment variable is needed, add it to .env.example with a comment saying where the value comes from, then STOP and tell the owner to add the real value by hand.
- Never hardcode keys, echo them in output, or commit them.

## How to work
1. Every task starts with an implementation plan: files to create or change, what each one is for in plain English, and risks. Wait for approval before implementing.
2. After implementing, VERIFY: run typecheck and lint, run the app, exercise the change with curl or the browser. Never claim something works without running it.
3. Commit after each completed task using Conventional Commits (feat:, fix:, chore:, docs:, test:). Small incremental commits. Push when a remote exists. Never commit .env.
4. BUILD_LOG.md is append-only. For every error, failed command, unexpected behaviour or wrong assumption of your own, append:
   ### <short title> (<date and time>)
   - Symptom: exact error text or observed behaviour
   - Investigation: everything you checked, INCLUDING checks that turned out irrelevant
   - Cause:
   - Fix:
   - Commit: <hash>
   Never delete, merge or tidy earlier entries. Specific and honest beats polished.
5. DECISIONS.md: whenever you choose between alternatives, append: Decision / Chosen / Rejected and why / Files.
6. End every task with: (a) files changed, (b) how the owner can verify it manually, (c) three to five plain-language notes on the concepts involved.

## Commit conventions
- Do NOT add "Co-Authored-By: Claude" or any other AI attribution or co-author trailer to commit messages.
- Commits are authored as the repo owner only.
