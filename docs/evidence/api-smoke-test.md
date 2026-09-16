# API smoke test evidence (task A1.4)

All commands run with `curl.exe` from PowerShell against `npm run dev` on `http://localhost:3001`,
with `RESEND_API_KEY` set empty for that process only (dev emails print to the console instead of
sending). Cookie jars were written to `tmp/cookies/*.txt` (gitignored, never committed). Every
session token, reset token and cookie value below is redacted as `<REDACTED>`. All throwaway
users created during this test were deleted afterward; see "Cleanup" at the end.

## GET /api/auth/me, no session

```
curl.exe -s -i -X GET http://localhost:3001/api/auth/me
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"UNAUTHENTICATED","message":"You must be signed in."}}
```

## Foreign Origin -> 403

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://evil.example.com" `
  -d '{"name":"Test User","email":"test1@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 403 Forbidden
{"error":{"code":"FORBIDDEN_ORIGIN","message":"This request's origin is not allowed."}}
```

## POST /api/auth/signup, happy path

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -c tmp/cookies/user1.txt `
  -d '{"name":"Test User","email":"test1@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 201 Created
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Wed, 23 Sep 2026 17:35:36 GMT; HttpOnly; SameSite=lax
{"user":{"name":"Test User","email":"test1@example.com"},"next":"/verify-email"}
```

Server console (dev email, code redacted -- the real value was used in the next step and is not secret in this local test, but is omitted here for consistency):
```
===== DEV EMAIL (not sent) =====
To: test1@example.com
From: Auth Slice <onboarding@resend.dev>
Subject: Your verification code

Hi Test User,

Your verification code is: <REDACTED>
...
```

## POST /api/auth/signup, invalid body -> 400 with fields

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"not-an-email"}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"VALIDATION_ERROR","message":"One or more fields are invalid.","fields":{"name":["Invalid input: expected string, received undefined"],"email":["Enter a valid email address."],"password":["Invalid input: expected string, received undefined"]}}}
```

## POST /api/auth/signup, duplicate email -> 409

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" `
  -d '{"name":"Dup","email":"test1@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 409 Conflict
{"error":{"code":"EMAIL_TAKEN","message":"An account with this email already exists."}}
```

## POST /api/auth/verify-email, wrong code then correct code

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/verify-email -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b tmp/cookies/user1.txt -d '{"code":"000000"}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 4 attempts remaining."}}
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/verify-email -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b tmp/cookies/user1.txt -d '{"code":"<REDACTED>"}'
```
```
HTTP/1.1 200 OK
{"next":"/dashboard"}
```

## ALREADY_VERIFIED, on both verify-email and resend-code

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/verify-email -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b tmp/cookies/user1.txt -d '{"code":"123456"}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"ALREADY_VERIFIED","message":"This email is already verified."}}
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/resend-code -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b tmp/cookies/user1.txt -d '{}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"ALREADY_VERIFIED","message":"This email is already verified."}}
```

## Race test 1: 8 parallel wrong verification codes, attempts must never exceed 5

A fresh user `race-code@example.com` was signed up, then this loop fired 8 requests
concurrently, each with a wrong code:

```
for ($i = 1; $i -le 8; $i++) {
  Start-Job { curl.exe -s -X POST http://localhost:3001/api/auth/verify-email `
    -H "Content-Type: application/json" -H "Origin: http://localhost:3001" `
    -b tmp/cookies/racecode.txt -d '{"code":"111111"}' }
}
```

The 8 responses (order not guaranteed under concurrency):
```
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 4 attempts remaining."}}
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 3 attempts remaining."}}
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 2 attempts remaining."}}
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 0 attempts remaining."}}
{"error":{"code":"TOO_MANY_ATTEMPTS","message":"Too many attempts. Request a new code."}}
{"error":{"code":"TOO_MANY_ATTEMPTS","message":"Too many attempts. Request a new code."}}
{"error":{"code":"TOO_MANY_ATTEMPTS","message":"Too many attempts. Request a new code."}}
{"error":{"code":"CODE_INVALID","message":"That code is incorrect. 1 attempt remaining."}}
```

Exactly 5 requests consumed an attempt (remaining counts 4,3,2,1,0 appear once each across the
"CODE_INVALID" responses); the other 3 correctly got `TOO_MANY_ATTEMPTS` once the budget was
exhausted. Confirmed directly against the database:

```sql
SELECT attempts FROM email_verification_codes WHERE user_id = '<race-code user id>';
```
```
 attempts
----------
        5
```

`attempts` never exceeded `authConfig.verificationCode.maxAttempts` (5) despite 8 concurrent
requests, because the attempt is consumed by one atomic `UPDATE ... WHERE attempts < max ...
RETURNING` before any comparison happens (see src/app/api/auth/verify-email/route.ts).

## Race test 2: 2 parallel resend-code requests, exactly one 200 and one 429

A fresh user `race-resend@example.com` was signed up. Its code's `last_sent_at` was first
backdated past the cooldown window (otherwise both requests would correctly hit the cooldown
left over from signup itself, which is not the race being tested):

```sql
UPDATE email_verification_codes SET last_sent_at = now() - interval '2 minutes'
WHERE user_id = '<race-resend user id>';
```

Then two resend requests were fired concurrently:

```
for ($i = 1; $i -le 2; $i++) {
  Start-Job { curl.exe -s -i -X POST http://localhost:3001/api/auth/resend-code `
    -H "Content-Type: application/json" -H "Origin: http://localhost:3001" `
    -b tmp/cookies/raceresend.txt -d '{}' }
}
```

```
-- request A --
HTTP/1.1 200 OK
{"cooldownSeconds":60}

-- request B --
HTTP/1.1 429 Too Many Requests
retry-after: 60
{"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
```

Exactly one 200 and one 429, because the cooldown check and the code replacement happen in one
conditional `UPDATE ... WHERE last_sent_at <= now() - cooldown ... RETURNING` -- only one of the
two concurrent requests can match before the other's (or its own) write moves `last_sent_at`
forward (see src/app/api/auth/resend-code/route.ts).

## POST /api/auth/signin: unknown email vs wrong password (identical response)

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"test1@example.com","password":"wrongpassword"}'
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"nobody@example.com","password":"whatever123"}'
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}
```

Byte-identical bodies for "email doesn't exist" and "email exists, wrong password" -- the
dummy-hash comparison in the route means both paths also do the same amount of CPU work.

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -c tmp/cookies/signin1.txt `
  -d '{"email":"test1@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 200 OK
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Wed, 23 Sep 2026 17:40:21 GMT; HttpOnly; SameSite=lax
{"next":"/dashboard"}
```

## POST /api/auth/forgot-password: existing vs nonexistent email (identical response)

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/forgot-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"test1@example.com"}'
```
```
HTTP/1.1 200 OK
{"message":"If an account exists for that email, we've sent a password reset link."}
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/forgot-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"nobody@example.com"}'
```
```
HTTP/1.1 200 OK
{"message":"If an account exists for that email, we've sent a password reset link."}
```

Server console, printed AFTER the response above had already been sent (the lookup/token/email
work runs inside `after()`, so it never affects response timing):
```
===== DEV EMAIL (not sent) =====
To: test1@example.com
From: Auth Slice <onboarding@resend.dev>
Subject: Reset your password

Hi Test User,

Use this link to reset your password:
http://localhost:3001/reset-password?token=<REDACTED>
...
```

## POST /api/auth/reset-password: use, reuse, and old/new password sign-in

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/reset-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" `
  -d '{"token":"<REDACTED>","password":"newpassword456","confirmPassword":"newpassword456"}'
```
```
HTTP/1.1 200 OK
{"next":"/sign-in?reset=success"}
```

Reusing the exact same token:
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/reset-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" `
  -d '{"token":"<REDACTED>","password":"anotherpassword789","confirmPassword":"anotherpassword789"}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"TOKEN_INVALID_OR_EXPIRED","message":"This reset link is invalid or has expired."}}
```

Sign in with the OLD password (must fail):
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"test1@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}
```

Sign in with the NEW password (must succeed):
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -c tmp/cookies/signin-new.txt `
  -d '{"email":"test1@example.com","password":"newpassword456"}'
```
```
HTTP/1.1 200 OK
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Wed, 23 Sep 2026 17:40:51 GMT; HttpOnly; SameSite=lax
{"next":"/dashboard"}
```

The session created BEFORE the reset is now dead, confirming reset-password deletes all of the
user's sessions:
```
curl.exe -s -i -X GET http://localhost:3001/api/auth/me -b tmp/cookies/signin1.txt
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"UNAUTHENTICATED","message":"You must be signed in."}}
```

## POST /api/auth/signout, including signing out twice

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signout -H "Origin: http://localhost:3001" `
  -b tmp/cookies/signin-new.txt
```
```
HTTP/1.1 200 OK
set-cookie: auth_slice_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
{"next":"/sign-in"}
```

```
curl.exe -s -i -X GET http://localhost:3001/api/auth/me -b tmp/cookies/signin-new.txt
```
```
HTTP/1.1 401 Unauthorized
{"error":{"code":"UNAUTHENTICATED","message":"You must be signed in."}}
```

Signing out again with the same (now-invalid) cookie still succeeds:
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signout -H "Origin: http://localhost:3001" `
  -b tmp/cookies/signin-new.txt
```
```
HTTP/1.1 200 OK
{"next":"/sign-in"}
```

## Expired code (throwaway user, manual SQL, per the task's stated exception)

A fresh user `expire-test@example.com` was signed up. Because
`email_verification_codes_expires_after_created` (CHECK `expires_at > created_at`) correctly
rejected setting `expires_at` to a time before `created_at`, the code's `expires_at` was instead
set to `created_at + interval '1 second'` -- still satisfies the CHECK, and is already in the
past relative to "now" a moment later:

```sql
UPDATE email_verification_codes SET expires_at = created_at + interval '1 second'
WHERE user_id = '<expire-test user id>';
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/verify-email -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b tmp/cookies/expiretest.txt -d '{"code":"123456"}'
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"CODE_EXPIRED","message":"This code has expired. Request a new one."}}
```

## Idempotency: replay and key-reuse-with-different-body, on signup

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: idem-test-1" `
  -d '{"name":"Idem User","email":"idem-test@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 201 Created
set-cookie: auth_slice_session=<REDACTED>
{"user":{"name":"Idem User","email":"idem-test@example.com"},"next":"/verify-email"}
```

Same key, same body -- replayed, no new user created, no Set-Cookie:
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: idem-test-1" `
  -d '{"name":"Idem User","email":"idem-test@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 201 Created
idempotent-replayed: true
{"next":"/verify-email","user":{"name":"Idem User","email":"idem-test@example.com"}}
```

Same key, different body -- rejected:
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: idem-test-1" `
  -d '{"name":"Different","email":"different@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 422 Unprocessable Entity
{"error":{"code":"IDEMPOTENCY_KEY_REUSED","message":"This Idempotency-Key was already used with a different request body."}}
```

## Note: signupPerIp rate limit was genuinely hit mid-test

After 5 real signup POSTs from the test client's IP (success, invalid-body, duplicate-email,
and the two race-test signups), a 6th signup attempt correctly received:
```
HTTP/1.1 429 Too Many Requests
{"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
```
This is `signupPerIp` (max 5 per hour) working as configured, not a bug. Remaining tests used a
distinct `X-Forwarded-For` header per test "client" to continue testing without waiting out the
window -- acceptable for local testing given `getClientIp`'s own documented caveat that this
header is only trustworthy behind a proxy you control.

## Cleanup

All throwaway users (`test1@example.com`, `race-code@example.com`, `race-resend@example.com`,
`expire-test@example.com`, `idem-test@example.com`) were deleted, cascading their sessions,
verification codes, and reset tokens. `rate_limit_buckets` and `idempotency_keys` rows created
by this test run were also deleted. Confirmed via `pg_constraint`-style scalar subqueries (not a
cross join -- see BUILD_LOG.md):

```sql
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM sessions) AS sessions,
       (SELECT count(*) FROM email_verification_codes) AS codes,
       (SELECT count(*) FROM password_reset_tokens) AS reset_tokens,
       (SELECT count(*) FROM rate_limit_buckets) AS rate_limit_buckets,
       (SELECT count(*) FROM idempotency_keys) AS idempotency_keys;
```
```
 users | sessions | codes | reset_tokens | rate_limit_buckets | idempotency_keys
-------+----------+-------+--------------+---------------------+------------------
     0 |        0 |     0 |            0 |                   0 |                0
```
