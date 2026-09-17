# Evidence index

Every file here was produced with `curl.exe` against a running `npm run dev` on
`http://localhost:3001`, or with `psql` against the Docker Compose database, or with
`npx tsx` against a standalone script. Cookie and token values are redacted as `<REDACTED>`
throughout. All throwaway users created while gathering this evidence were deleted afterward
(see "Cleanup" below).

| File | What it proves |
|---|---|
| [e1-users-hash.md](e1-users-hash.md) + **e1-users-hash.png** | Passwords are hashed with argon2id, not stored in plain text — the full `users` table schema has no plain-password column, and the screenshot shows a real stored hash starting with `$argon2id$`. |
| [e2-signup-curl.md](e2-signup-curl.md) | Signup driven entirely by `curl` (no browser): a valid request with an `Idempotency-Key`, a request the browser form would already block (malformed email / 3-char password / empty name), an identical key+body sent twice in a row (one real signup, one exact replay, `idempotent-replayed: true`, exactly 1 row in the database), and two requests for one new email with no key at all (one 201, one 409 `EMAIL_TAKEN`, still exactly 1 row). |
| [e3-rate-limits.md](e3-rate-limits.md) | 6 wrong-password sign-ins for one account: 5 real checks, the 6th rate-limited; full headers of a 429 including `Retry-After`; `resend-code` called twice inside its cooldown, both 429; the resulting `rate_limit_buckets` rows. |
| [e4-code-expiry.md](e4-code-expiry.md) + **e4-code-expired.png** | A verification code expires in the database after a genuine, unedited 10-minute wait — full curl/SQL text evidence shows the row's columns identical before and after (only `now()` moved, then the real code is rejected as `CODE_EXPIRED`); the screenshot shows a live `expires_at < now()` comparison returning `true` after a second genuine wait. |
| [e5-reset-single-use.md](e5-reset-single-use.md) | A password reset token works exactly once: the same link reused gets `TOKEN_INVALID_OR_EXPIRED`, the database row shows `used_at` filled in, the old password stops working, and the new one works. |
| [e6-drift-check.md](e6-drift-check.md) | [constraints.md](constraints.md) and [protected-routes.md](protected-routes.md) (written before task A1.7's fixes) were re-run against the current code. No functional drift found in either. |
| [env-check.txt](env-check.txt) | `git ls-files \| grep -i env` — proves only `.env.example` is tracked, never `.env`. |
| [constraints.md](constraints.md) | (From task A1.2.) Every database CHECK/UNIQUE/FOREIGN KEY constraint and evidence each one actually fires. |
| [api-smoke-test.md](api-smoke-test.md) | (From task A1.4.) The full auth API exercised end to end, including two deliberate concurrency races. |
| [protected-routes.md](protected-routes.md) | (From task A1.6.) The two-layer dashboard protection (`proxy.ts` + `getCurrentUser()`) and the open-redirect guard on `?next=`. |

## Screenshots (taken by the project owner, not by the assistant — no browser available here)

- **e1-users-hash.png** — terminal screenshot of `SELECT email, name, password_hash FROM users
  WHERE email = 'e4-expiry-2@example.com'`, showing the full `password_hash` starting with
  `$argon2id$`. (Reused `e4-expiry-2@example.com`, since the original `evidence-user@example.com`
  row was already deleted in cleanup before its own screenshot was taken.)
- **e4-code-expired.png** — terminal screenshot of a live `expires_at < now()` comparison for
  `e4-expiry-2@example.com`'s verification code, returning `true` after a genuine 10+ minute
  wait. (A Prisma Studio screenshot of an unchanged row would prove nothing about time passing on
  its own, since the columns don't update themselves — this single live-comparison query is the
  actual proof; see `e4-code-expiry.md` for the reasoning and the full first-attempt evidence.)

## Cleanup

All throwaway users created for this task's evidence (`evidence-user@example.com`,
`e2a-user@example.com`, `e2c-user@example.com`, `e2d-user@example.com`, `e3-user@example.com`,
`e4-expiry@example.com`, `e5-user@example.com`, `e4-expiry-2@example.com`) were deleted after
every screenshot and query was captured, along with the `rate_limit_buckets` rows created while
testing. Confirmed via:

```sql
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM sessions) AS sessions,
       (SELECT count(*) FROM email_verification_codes) AS codes,
       (SELECT count(*) FROM password_reset_tokens) AS reset_tokens,
       (SELECT count(*) FROM rate_limit_buckets) AS rate_limit_buckets;
```
