# E3 — rate limits: sign-in and resend-code

Dedicated throwaway user `e3-user@example.com` signed up first (unverified, which is what
`resend-code` requires anyway).

## Six wrong-password sign-in attempts for one email

```
for ($i = 1; $i -le 6; $i++) {
  curl.exe -s -o out.json -w "attempt $i -> %{http_code}`n" -X POST http://localhost:3001/api/auth/signin `
    -H "Content-Type: application/json" -H "Origin: http://localhost:3001" `
    -d "{`"email`":`"e3-user@example.com`",`"password`":`"wrongpassword$i`"}"
}
```

```
attempt 1 -> 401
attempt 2 -> 401
attempt 3 -> 401
attempt 4 -> 401
attempt 5 -> 401
attempt 6 -> 429
```

Exactly 5 attempts get a real `INVALID_CREDENTIALS` check (matching
`authConfig.rateLimits.signinPerIpEmail.max = 5`); the 6th is rejected by the rate limiter before
any password comparison happens.

## Full headers of the 429

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signin -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -d '{"email":"e3-user@example.com","password":"wrongpassword7"}'
```

```
HTTP/1.1 429 Too Many Requests
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
retry-after: 134
Date: Thu, 17 Sep 2026 18:12:46 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
```

## resend-code called twice inside the cooldown

The user's verification code was created moments earlier at signup (`last_sent_at = now()`), so
both calls land inside the 60-second cooldown -- exactly the case being tested.

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/resend-code -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b cookies.txt -d '{}'
```
```
HTTP/1.1 429 Too Many Requests
retry-after: 20
content-type: application/json

{"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
```

Same call again, immediately after:
```
HTTP/1.1 429 Too Many Requests
retry-after: 20
content-type: application/json

{"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
```

## Resulting rate_limit_buckets rows

```sql
SELECT key, window_start, count FROM rate_limit_buckets ORDER BY key;
```
```
                       key                        |      window_start      | count
--------------------------------------------------+------------------------+-------
 resend:user:8d4c3cbb-515d-4abd-9d53-969f8f71d769 | 2026-09-17 18:00:00+00 |     2
 signin:ip-email:direct:e3-user@example.com       | 2026-09-17 18:00:00+00 |     7
 signin:ip:direct                                 | 2026-09-17 18:00:00+00 |     7
 signup:ip:direct                                 | 2026-09-17 18:00:00+00 |     4
```

`signin:ip-email` and `resend:user` counted every attempt including the ones already rejected
(7 and 2 respectively -- the 6 sign-in attempts plus the extra header-capture request, and the 2
resend calls), confirming the limiter counts every request against the bucket, not just the ones
that would otherwise have succeeded.
