# E2 — signup via curl, bypassing the browser entirely

All commands run with `curl.exe` from PowerShell against `http://localhost:3001`. Cookie/session
values redacted as `<REDACTED>`.

## E2a — valid request with an Idempotency-Key, -i

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e2a-key-001" `
  -d '{"name":"E2A User","email":"e2a-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 201 Created
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Thu, 24 Sep 2026 18:09:49 GMT; HttpOnly; SameSite=lax
Date: Thu, 17 Sep 2026 18:09:49 GMT

{"user":{"name":"E2A User","email":"e2a-user@example.com"},"next":"/verify-email"}
```

## E2b — a request the browser form would already block: malformed email, 3-char password, empty name

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"name":"","email":"not-an-email","password":"ab"}'
```

```
HTTP/1.1 400 Bad Request
content-type: application/json

{"error":{"code":"VALIDATION_ERROR","message":"One or more fields are invalid.","fields":{"name":["Name is required."],"email":["Enter a valid email address."],"password":["Password must be at least 8 characters."]}}}
```

(The actual submitted password was 2 characters, not 3, to guarantee it fails the 8-character
minimum regardless of exact wording -- the field-level error confirms the length check fired.)

## E2c — same Idempotency-Key AND body, sent twice in immediate succession

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e2c-key-shared" `
  -d '{"name":"E2C User","email":"e2c-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 201 Created
content-type: application/json
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Thu, 24 Sep 2026 18:10:15 GMT; HttpOnly; SameSite=lax
Date: Thu, 17 Sep 2026 18:10:15 GMT

{"user":{"name":"E2C User","email":"e2c-user@example.com"},"next":"/verify-email"}
```

Second request, same key and body, sent immediately after:

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e2c-key-shared" `
  -d '{"name":"E2C User","email":"e2c-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 201 Created
content-type: application/json
idempotent-replayed: true
Date: Thu, 17 Sep 2026 18:11:12 GMT

{"next":"/verify-email","user":{"name":"E2C User","email":"e2c-user@example.com"}}
```

Note: the first attempt at this replay hit `429 RATE_LIMITED` instead, because five earlier
signups in this same evidence session (E1, E2a, and the first E2c attempt) had already filled
`signupPerIp`'s bucket -- since task A1.7's fix, every client without a trusted proxy shares one
`signup:ip:direct` bucket by design (see DECISIONS.md, "Trusting X-Forwarded-For/X-Real-IP only
behind a configured proxy"). The bucket was cleared with
`DELETE FROM rate_limit_buckets WHERE key = 'signup:ip:direct';` (an operational reset of an
unrelated counter, not a change to the idempotency logic under test) and the replay request
above was then re-sent, producing the `idempotent-replayed: true` result shown.

No new user was created by the replay:
```sql
SELECT count(*) FROM users WHERE email = 'e2c-user@example.com';
```
```
 count
-------
     1
```

## E2d — two requests WITHOUT an Idempotency-Key, one new email, back to back

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" `
  -d '{"name":"E2D User","email":"e2d-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 201 Created
content-type: application/json
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Thu, 24 Sep 2026 18:11:52 GMT; HttpOnly; SameSite=lax
Date: Thu, 17 Sep 2026 18:11:52 GMT

{"user":{"name":"E2D User","email":"e2d-user@example.com"},"next":"/verify-email"}
```

Same body, no Idempotency-Key, sent immediately after:

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" `
  -d '{"name":"E2D User","email":"e2d-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 409 Conflict
content-type: application/json
Date: Thu, 17 Sep 2026 18:11:52 GMT

{"error":{"code":"EMAIL_TAKEN","message":"An account with this email already exists."}}
```

Without an Idempotency-Key, the database's own UNIQUE constraint on `email` is the backstop:
```sql
SELECT count(*) FROM users WHERE email = 'e2d-user@example.com';
```
```
 count
-------
     1
```
