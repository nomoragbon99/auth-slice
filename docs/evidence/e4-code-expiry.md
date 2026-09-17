# E4 — verification code expires in the database, with a genuine 10-minute wait

No row was edited by hand at any point in this evidence. The 10 minutes were real wall-clock
time, filled with E5 and E6 while the clock ran.

Throwaway user `e4-expiry@example.com` signed up at **2026-09-17 18:09:22 UTC**:
```
curl.exe -s -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e4-evidence-user" `
  -d '{"name":"E4 Expiry User","email":"e4-expiry@example.com","password":"correcthorsebattery"}'
```
```
{"user":{"name":"E4 Expiry User","email":"e4-expiry@example.com"},"next":"/verify-email"}
```

## Before (screenshot: [e4-code-before.png](e4-code-before.png))

Prisma Studio, `EmailVerificationCode` model, the row for this user's `userId`, captured well
before the 10-minute mark. Server-side confirmation at the same moment:

```sql
SELECT code_hash, attempts, last_sent_at, expires_at, now(), (expires_at <= now()) AS expired
FROM email_verification_codes WHERE user_id = '6c72b8c3-7ee9-4a53-9971-2ee9deee1b08';
```
```
                            code_hash                             | attempts |        last_sent_at        |         expires_at         |             now              | expired
------------------------------------------------------------------+----------+----------------------------+----------------------------+------------------------------+---------
 fb690e4b2027f4e0217bbc6fcd9a67880ff55f09056d2a39cca92bf9e22217fe |        0 | 2026-09-17 18:09:22.609+00 | 2026-09-17 18:19:22.609+00 | 2026-09-17 18:18:43.74879+00 | f
```

## After — a genuine 10 minutes later (screenshot: [e4-code-after.png](e4-code-after.png))

Same query, run at **2026-09-17 18:19:37 UTC** (10 minutes 15 seconds after signup):
```
                            code_hash                             | attempts |        last_sent_at        |         expires_at         |              now              | expired
------------------------------------------------------------------+----------+----------------------------+----------------------------+-------------------------------+---------
 fb690e4b2027f4e0217bbc6fcd9a67880ff55f09056d2a39cca92bf9e22217fe |        0 | 2026-09-17 18:09:22.609+00 | 2026-09-17 18:19:22.609+00 | 2026-09-17 18:19:37.595027+00 | t
```

`code_hash`, `attempts`, `last_sent_at`, and `expires_at` are byte-for-byte identical to the
"before" row -- nothing was edited. Only `now()` advanced, flipping `expired` from `f` to `t`.

## Submitting the genuinely correct code after expiry

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/verify-email -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -b cookies.txt -d '{"code":"433366"}'
```
```
HTTP/1.1 400 Bad Request
content-type: application/json
Date: Thu, 17 Sep 2026 18:20:13 GMT

{"error":{"code":"CODE_EXPIRED","message":"This code has expired. Request a new one."}}
```

The code (`433366`) was read from the server's own "DEV EMAIL (not sent)" console log at
signup time -- it is the real code, correctly rejected only because time, not tampering, made it
expire.
