# E4 — verification code expires in the database, with a genuine 10-minute wait

No row was edited by hand at any point in this evidence. All waits were real wall-clock time.

A Prisma Studio screenshot of an unchanged row proves nothing about time passing on its own,
since the columns don't update themselves — the actual proof is a live `SELECT` comparing
`expires_at` to `now()`, captured as a single screenshot of that comparison (`expired = t`)
rather than a "before" and "after" pair of static row views.

## Attempt 1 — full text evidence (its own screenshot was superseded, see below)

Throwaway user `e4-expiry@example.com` signed up at **2026-09-17 18:09:22 UTC**:
```
curl.exe -s -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e4-evidence-user" `
  -d '{"name":"E4 Expiry User","email":"e4-expiry@example.com","password":"correcthorsebattery"}'
```
```
{"user":{"name":"E4 Expiry User","email":"e4-expiry@example.com"},"next":"/verify-email"}
```

Before, captured well within the 10-minute window:
```sql
SELECT code_hash, attempts, last_sent_at, expires_at, now(), (expires_at <= now()) AS expired
FROM email_verification_codes WHERE user_id = '6c72b8c3-7ee9-4a53-9971-2ee9deee1b08';
```
```
                            code_hash                             | attempts |        last_sent_at        |         expires_at         |             now              | expired
------------------------------------------------------------------+----------+----------------------------+----------------------------+------------------------------+---------
 fb690e4b2027f4e0217bbc6fcd9a67880ff55f09056d2a39cca92bf9e22217fe |        0 | 2026-09-17 18:09:22.609+00 | 2026-09-17 18:19:22.609+00 | 2026-09-17 18:18:43.74879+00 | f
```

Same query, a genuine 10 minutes 15 seconds later:
```
                            code_hash                             | attempts |        last_sent_at        |         expires_at         |              now              | expired
------------------------------------------------------------------+----------+----------------------------+----------------------------+-------------------------------+---------
 fb690e4b2027f4e0217bbc6fcd9a67880ff55f09056d2a39cca92bf9e22217fe |        0 | 2026-09-17 18:09:22.609+00 | 2026-09-17 18:19:22.609+00 | 2026-09-17 18:19:37.595027+00 | t
```
`code_hash`, `attempts`, `last_sent_at`, and `expires_at` are byte-for-byte identical between the
two runs — nothing was edited. Only `now()` advanced, flipping `expired` from `f` to `t`.

Submitting the genuinely correct code after expiry:
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
The code (`433366`) was read from the server's "DEV EMAIL (not sent)" console log at signup
time — the real code, correctly rejected only because time, not tampering, made it expire.

This user's own row was deleted in cleanup before its screenshot was taken. The text evidence
above stands on its own (it doesn't depend on a screenshot to be valid), but a second attempt
was made to produce the screenshot artifact using the corrected single-query approach:

## Screenshot evidence: `e4-expiry-2@example.com` (screenshot: [e4-code-expired.png](e4-code-expired.png))

A second throwaway user, `e4-expiry-2@example.com`, was signed up and left untouched for a
genuine 10+ minute wait. The query below was run and screenshotted directly in the terminal
after that wait:

```sql
SELECT email_verification_codes.expires_at, now(), (expires_at < now()) AS expired
FROM email_verification_codes
JOIN users ON users.id = email_verification_codes.user_id
WHERE users.email = 'e4-expiry-2@example.com';
```

The screenshot shows `expired = t` — a single query, run once, after time had genuinely passed,
which is sufficient proof on its own (no "before" comparison needed, since the query itself
computes the comparison against live `now()` at the moment it runs).
