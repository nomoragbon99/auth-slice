# E5 — password reset tokens are single-use

Throwaway user `e5-user@example.com` signed up, then a reset requested for it.

## Request the reset

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/forgot-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"e5-user@example.com"}'
```
```
HTTP/1.1 200 OK
content-type: application/json

{"message":"If an account exists for that email, we've sent a password reset link."}
```

Token read from the server's console log (`token=<REDACTED>` below, real value used in the
requests that follow):
```
Use this link to reset your password:
http://localhost:3001/reset-password?token=<REDACTED>
```

## Use the link once

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/reset-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"token":"<REDACTED>","password":"newpass5678","confirmPassword":"newpass5678"}'
```
```
HTTP/1.1 200 OK
content-type: application/json

{"next":"/sign-in?reset=success"}
```

## Reuse the SAME token

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/reset-password -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"token":"<REDACTED>","password":"anotherpass999","confirmPassword":"anotherpass999"}'
```
```
HTTP/1.1 400 Bad Request
content-type: application/json

{"error":{"code":"TOKEN_INVALID_OR_EXPIRED","message":"This reset link is invalid or has expired."}}
```

## The password_reset_tokens row, used_at now filled

```sql
SELECT id, user_id, expires_at, used_at, created_at FROM password_reset_tokens
WHERE user_id = (SELECT id FROM users WHERE email = 'e5-user@example.com');
```
```
                  id                  |               user_id                |         expires_at         |            used_at            |         created_at
--------------------------------------+--------------------------------------+----------------------------+-------------------------------+----------------------------
 <REDACTED>                            | <REDACTED>                            | 2026-09-17 18:44:02.067+00 | 2026-09-17 18:14:37.731167+00 | 2026-09-17 18:14:02.068+00
```

`used_at` is filled the moment the token was consumed, well before its `expires_at` -- this row
was used up, not expired.

## Old password fails, new password succeeds

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"e5-user@example.com","password":"correcthorsebattery"}'
```
```
HTTP/1.1 401 Unauthorized
content-type: application/json

{"error":{"code":"INVALID_CREDENTIALS","message":"Incorrect email or password."}}
```

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"e5-user@example.com","password":"newpass5678"}'
```
```
HTTP/1.1 200 OK
content-type: application/json
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Thu, 24 Sep 2026 18:15:00 GMT; HttpOnly; SameSite=lax

{"next":"/verify-email"}
```
