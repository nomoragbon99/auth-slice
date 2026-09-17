# E1 — argon2id password hash, no plain password column

Screenshot: [e1-users-hash.png](e1-users-hash.png) — Prisma Studio, `User` model, the row for
`evidence-user@example.com` / "Evidence User", showing the full `passwordHash` starting with
`$argon2id$`.

## Command: sign up the throwaway user

```
curl.exe -s -i -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" `
  -H "Origin: http://localhost:3001" -H "Idempotency-Key: e1-evidence-user" `
  -d '{"name":"Evidence User","email":"evidence-user@example.com","password":"correcthorsebattery"}'
```

```
HTTP/1.1 201 Created
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
set-cookie: auth_slice_session=<REDACTED>; Path=/; Expires=Thu, 24 Sep 2026 18:08:55 GMT; HttpOnly; SameSite=lax
Date: Thu, 17 Sep 2026 18:08:55 GMT

{"user":{"name":"Evidence User","email":"evidence-user@example.com"},"next":"/verify-email"}
```

## Command: every column on `users`, proving no plain password column exists

```
docker compose exec db psql -U auth -d auth -c "\d users"
```

```
                                  Table "public.users"
      Column       |           Type           | Collation | Nullable |      Default
-------------------+--------------------------+-----------+----------+-------------------
 id                | uuid                     |           | not null | gen_random_uuid()
 email             | text                     |           | not null |
 name              | text                     |           | not null |
 password_hash     | text                     |           | not null |
 email_verified_at | timestamp with time zone |           |          |
 created_at        | timestamp with time zone |           | not null | CURRENT_TIMESTAMP
 updated_at        | timestamp with time zone |           | not null | CURRENT_TIMESTAMP
Indexes:
    "users_pkey" PRIMARY KEY, btree (id)
    "users_email_key" UNIQUE, btree (email)
Check constraints:
    "users_email_lowercase_trimmed" CHECK (email = lower(btrim(email)))
    "users_name_length" CHECK (char_length(name) >= 1 AND char_length(name) <= 80)
Referenced by:
    TABLE "email_verification_codes" CONSTRAINT "email_verification_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
    TABLE "password_reset_tokens" CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
    TABLE "sessions" CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
```

The only password-related column is `password_hash` (`text`) — there is no column that could
hold a plain password. The screenshot proves that column's actual stored value for this user
starts with `$argon2id$`, confirming the adaptive hash is genuinely what's persisted, not just
what the code claims to do.
