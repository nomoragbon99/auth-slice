# Protected-routes evidence (task A1.6)

Commands run with `curl.exe` from PowerShell against `npm run dev` on `http://localhost:3001`,
with `RESEND_API_KEY` set empty for that process only. Cookie jars in `tmp/cookies/*.txt`
(gitignored). Session id and cookie values below are redacted as `<REDACTED>`. The test user
created for this evidence was deleted afterward; see "Cleanup".

## (a) /dashboard with no cookie -> layer 1 (proxy.ts) redirects

```
curl.exe -s -i http://localhost:3001/dashboard
```
```
HTTP/1.1 307 Temporary Redirect
location: /sign-in?next=%2Fdashboard
```

No database query happens here at all -- `proxy.ts` only checked whether a cookie named
`auth_slice_session` was present, found none, and redirected immediately.

## (b) /dashboard with a FORGED cookie -> layer 1 lets it through, layer 2 catches it

```
curl.exe -s -i http://localhost:3001/dashboard -H "Cookie: auth_slice_session=forged"
```
```
HTTP/1.1 307 Temporary Redirect
location: /sign-in
```

This proves the two layers are doing different jobs. `proxy.ts` saw *a* cookie named
`auth_slice_session` and let the request through (it never inspects the value). The redirect
still happened because `dashboard/page.tsx`'s own `getCurrentUser()` hashed `"forged"`, looked
for a matching row in `sessions`, found none, and redirected -- notice this redirect has no
`?next=` (it comes from the page's own `redirect("/sign-in")`, not from `proxy.ts`), which is
exactly the difference between the two redirect call sites.

## (c) Sign in, sign out, replay the OLD cookie -> proves sign-out ends the session server-side

Signed up and verified a dedicated test user (`a16-test@example.com`) first, landing on
`/dashboard` with a valid session cookie saved to `tmp/cookies/a16.txt`.

```
curl.exe -s -i http://localhost:3001/dashboard -b tmp/cookies/a16.txt
```
```
HTTP/1.1 200 OK
```

Sign out:
```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signout -H "Origin: http://localhost:3001" -b tmp/cookies/a16.txt
```
```
HTTP/1.1 200 OK
```

Replay the SAME (now stale) cookie jar against `/dashboard` again, without signing in again:
```
curl.exe -s -i http://localhost:3001/dashboard -b tmp/cookies/a16.txt
```
```
HTTP/1.1 307 Temporary Redirect
location: /sign-in
```

If sign-out had only cleared the browser's cookie and left the server-side session row alone,
replaying the old cookie value would still work. It doesn't, because sign-out deletes the row.

## (d) sessions table before and after sign-out

Before sign-out:
```sql
SELECT s.id, s.user_id, u.email, s.expires_at FROM sessions s
JOIN users u ON u.id = s.user_id WHERE u.email = 'a16-test@example.com';
```
```
                 id                 |               user_id               |        email          |         expires_at
------------------------------------+--------------------------------------+------------------------+----------------------------
 <REDACTED>                          | <REDACTED>                           | a16-test@example.com  | 2026-09-24 16:21:21.146+00
(1 row)
```

After sign-out:
```sql
SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'a16-test@example.com';
```
```
 count
-------
     0
(1 row)
```

The row is gone, not just expired or marked invalid -- signing out deletes it outright.

## (e) Open-redirect protection for ?next= -- via a script, not curl

`curl` can't exercise this case: the `?next=` check (`getSafeRedirectPath`) runs inside the
browser's sign-in form component after a successful sign-in, not on the server, so no `curl`
request ever executes that code -- a curl-based test here would "pass" whether or not the
protection existed. Verified directly instead with a small script:

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

Only the genuinely safe input (`"/dashboard"`, a same-site relative path) passes through
unchanged. Every attack shape falls back to the default: protocol-relative (`//evil.example`),
the backslash trick browsers normalize to protocol-relative (`/\evil.example`), an absolute URL
to another host, a `javascript:` URL, an empty string, `null`, and a path missing its leading
slash.

### Pending owner check (needs a real browser -- I can't drive one)

Open `http://localhost:3001/sign-in?next=//evil.example` in a real browser, sign in with any
account, and confirm you land on `/dashboard` -- not on `evil.example` or anywhere else.

## Cleanup

```sql
DELETE FROM users WHERE email = 'a16-test@example.com';
```
Cascades to that user's session and verification-code rows. Confirmed:
```sql
SELECT (SELECT count(*) FROM users WHERE email = 'a16-test@example.com') AS test_user,
       (SELECT count(*) FROM sessions) AS remaining_sessions;
```
```
 test_user | remaining_sessions
-----------+---------------------
         0 |                   0
```

(`remaining_sessions` is 0 because the only other account on this database, the owner's own
`nosaomoragbon99@gmail.com` from manual testing, was signed out at the time this evidence was
collected -- that account itself was left untouched, since it isn't a throwaway test user.)
