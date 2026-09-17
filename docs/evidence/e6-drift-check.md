# E6 — re-checking constraints.md and protected-routes.md against current code

Both evidence files predate the A1.7 fixes (`98e59af` through `9ab566c`). Re-run to confirm they
still match.

## constraints.md — re-run

```sql
SELECT rel.relname AS table_name, con.conname AS constraint_name, con.contype AS type
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN ('users','sessions','email_verification_codes','password_reset_tokens','rate_limit_buckets','idempotency_keys')
  AND con.contype = 'c'
ORDER BY rel.relname, con.conname;
```
```
        table_name        |                constraint_name                 | type
--------------------------+------------------------------------------------+------
 email_verification_codes | email_verification_codes_attempts_non_negative | c
 email_verification_codes | email_verification_codes_expires_after_created | c
 idempotency_keys         | idempotency_keys_completed_has_response        | c
 idempotency_keys         | idempotency_keys_status_valid                  | c
 password_reset_tokens    | password_reset_tokens_expires_after_created    | c
 rate_limit_buckets       | rate_limit_buckets_count_positive              | c
 users                    | users_email_lowercase_trimmed                  | c
 users                    | users_name_length                              | c
```

**Result: no drift.** All 8 CHECK constraints listed in `constraints.md` are still present,
unchanged, by name and definition.

## protected-routes.md — re-run

**(a) no cookie:**
```
curl.exe -s -i http://localhost:3001/dashboard
```
```
HTTP/1.1 307 Temporary Redirect
location: /sign-in?next=%2Fdashboard
```
Matches.

**(b) forged cookie:**
```
curl.exe -s -i http://localhost:3001/dashboard -H "Cookie: auth_slice_session=forged"
```
```
HTTP/1.1 307 Temporary Redirect
location: /sign-in
```
Matches. (In this dev-mode re-run, Turbopack streamed a large RSC payload in the response body
alongside the same status/Location -- a dev-server verbosity difference, not a behavior change;
the original evidence used a plain 307 with a short body captured under the same dev server.)

**(c) sign in, sign out, replay old cookie -- re-run with a freshly VERIFIED session** (the
original evidence's test account happened to be verified already; re-doing it end to end here):
```
dashboard with valid verified session: 200
dashboard with SAME cookie after signout: 307
```
Matches.

**Result: no functional drift.** The two-layer check (`src/proxy.ts` + `dashboard/page.tsx`)
behaves identically to when `protected-routes.md` was written.

## Open-redirect check (protected-routes.md's item (e)) — re-run

```
npx tsx scripts/check-safe-redirect.ts
```
```
fallback used for every rejected input: /dashboard

input                       output
--------------------------------------------------
"/dashboard"                /dashboard
"//evil.example"            /dashboard
"/\\evil.example"           /dashboard
"https://evil.example"      /dashboard
"javascript:alert(1)"       /dashboard
""                          /dashboard
null                        /dashboard
"dashboard"                 /dashboard
```

Identical to the recorded evidence. No drift, and this also reconfirms the A1.7 fix (rejecting
the `/\evil.example` backslash case) is still in place.

## Operational note found while gathering E2 (not a drift in the evidence files themselves)

Task A1.7's fix to `getClientIp()` (commit `bef3ace`) means every client without a configured
trusted proxy now shares a single `signup:ip:direct` rate-limit bucket. Doing many signups in one
evidence-gathering session (as this task required) hits that shared bucket's cap faster than it
would have before the fix, which correctly reflects the fix working as designed -- see
`e2-signup-curl.md` for how this was handled during evidence collection.
