# E1 — argon2id password hash, no plain password column

Screenshot: [e1-users-hash.png](e1-users-hash.png) — a terminal screenshot of the query below,
for the row `e4-expiry-2@example.com` / "E4 Expiry User" (the throwaway user created for E4's
second attempt, reused here rather than creating a fresh one — its `evidence-user@example.com`
row was already deleted in this task's cleanup before its own screenshot was taken).

## Query shown in the screenshot

```sql
SELECT email, name, password_hash FROM users WHERE email = 'e4-expiry-2@example.com';
```

Confirmed immediately before the screenshot:
```
          email          |      name      |     hash_prefix
-------------------------+----------------+----------------------
 e4-expiry-2@example.com | E4 Expiry User | $argon2id$v=19$m=194
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
