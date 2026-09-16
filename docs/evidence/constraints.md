# Database constraint evidence

Evidence for the `init_auth` migration (`prisma/migrations/20260916111844_init_auth/migration.sql`).
All commands were run against the local Docker Compose database (`docker compose exec db psql -U auth -d auth`).

## 1. Every constraint on the six auth tables (`pg_constraint`)

```sql
SELECT rel.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN ('users','sessions','email_verification_codes','password_reset_tokens','rate_limit_buckets','idempotency_keys')
ORDER BY rel.relname, con.contype, con.conname;
```

```
        table_name        |                constraint_name                 | type |                                                 definition
--------------------------+------------------------------------------------+------+------------------------------------------------------------------------------------------------------------
 email_verification_codes | email_verification_codes_attempts_non_negative | c    | CHECK ((attempts >= 0))
 email_verification_codes | email_verification_codes_expires_after_created | c    | CHECK ((expires_at > created_at))
 email_verification_codes | email_verification_codes_user_id_fkey          | f    | FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
 email_verification_codes | email_verification_codes_attempts_not_null     | n    | NOT NULL attempts
 email_verification_codes | email_verification_codes_code_hash_not_null    | n    | NOT NULL code_hash
 email_verification_codes | email_verification_codes_created_at_not_null   | n    | NOT NULL created_at
 email_verification_codes | email_verification_codes_expires_at_not_null   | n    | NOT NULL expires_at
 email_verification_codes | email_verification_codes_id_not_null           | n    | NOT NULL id
 email_verification_codes | email_verification_codes_last_sent_at_not_null | n    | NOT NULL last_sent_at
 email_verification_codes | email_verification_codes_user_id_not_null      | n    | NOT NULL user_id
 email_verification_codes | email_verification_codes_pkey                  | p    | PRIMARY KEY (id)
 idempotency_keys         | idempotency_keys_completed_has_response        | c    | CHECK (((status = 'processing'::text) OR ((response_status IS NOT NULL) AND (response_body IS NOT NULL))))
 idempotency_keys         | idempotency_keys_status_valid                  | c    | CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text])))
 idempotency_keys         | idempotency_keys_created_at_not_null           | n    | NOT NULL created_at
 idempotency_keys         | idempotency_keys_expires_at_not_null           | n    | NOT NULL expires_at
 idempotency_keys         | idempotency_keys_key_not_null                  | n    | NOT NULL key
 idempotency_keys         | idempotency_keys_request_hash_not_null         | n    | NOT NULL request_hash
 idempotency_keys         | idempotency_keys_scope_not_null                | n    | NOT NULL scope
 idempotency_keys         | idempotency_keys_status_not_null               | n    | NOT NULL status
 idempotency_keys         | idempotency_keys_pkey                          | p    | PRIMARY KEY (scope, key)
 password_reset_tokens    | password_reset_tokens_expires_after_created    | c    | CHECK ((expires_at > created_at))
 password_reset_tokens    | password_reset_tokens_user_id_fkey             | f    | FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
 password_reset_tokens    | password_reset_tokens_created_at_not_null      | n    | NOT NULL created_at
 password_reset_tokens    | password_reset_tokens_expires_at_not_null      | n    | NOT NULL expires_at
 password_reset_tokens    | password_reset_tokens_id_not_null              | n    | NOT NULL id
 password_reset_tokens    | password_reset_tokens_token_hash_not_null      | n    | NOT NULL token_hash
 password_reset_tokens    | password_reset_tokens_user_id_not_null         | n    | NOT NULL user_id
 password_reset_tokens    | password_reset_tokens_pkey                     | p    | PRIMARY KEY (id)
 rate_limit_buckets       | rate_limit_buckets_count_positive              | c    | CHECK ((count > 0))
 rate_limit_buckets       | rate_limit_buckets_count_not_null              | n    | NOT NULL count
 rate_limit_buckets       | rate_limit_buckets_key_not_null                | n    | NOT NULL key
 rate_limit_buckets       | rate_limit_buckets_window_start_not_null       | n    | NOT NULL window_start
 rate_limit_buckets       | rate_limit_buckets_pkey                        | p    | PRIMARY KEY (key, window_start)
 sessions                 | sessions_user_id_fkey                          | f    | FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
 sessions                 | sessions_created_at_not_null                   | n    | NOT NULL created_at
 sessions                 | sessions_expires_at_not_null                   | n    | NOT NULL expires_at
 sessions                 | sessions_id_not_null                           | n    | NOT NULL id
 sessions                 | sessions_user_id_not_null                      | n    | NOT NULL user_id
 sessions                 | sessions_pkey                                  | p    | PRIMARY KEY (id)
 users                    | users_email_lowercase_trimmed                  | c    | CHECK ((email = lower(btrim(email))))
 users                    | users_name_length                              | c    | CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
 users                    | users_created_at_not_null                      | n    | NOT NULL created_at
 users                    | users_email_not_null                           | n    | NOT NULL email
 users                    | users_id_not_null                              | n    | NOT NULL id
 users                    | users_name_not_null                            | n    | NOT NULL name
 users                    | users_password_hash_not_null                   | n    | NOT NULL password_hash
 users                    | users_updated_at_not_null                      | n    | NOT NULL updated_at
 users                    | users_pkey                                     | p    | PRIMARY KEY (id)
(48 rows)
```

`contype`: `c` = CHECK, `f` = FOREIGN KEY, `p` = PRIMARY KEY, `n` = attribute-level NOT NULL (Postgres 18 lists these in `pg_constraint` too; they come from `NOT NULL` on the column, not a hand-written CHECK).

The two `UNIQUE` constraints (`users.email`, `email_verification_codes.user_id`, `password_reset_tokens.token_hash`) are enforced as unique indexes rather than `pg_constraint` rows in this migration (Prisma's `@unique` generates `CREATE UNIQUE INDEX`), so they are listed separately:

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users','sessions','email_verification_codes','password_reset_tokens')
ORDER BY tablename, indexname;
```

```
        tablename         |              indexname               |                                                     indexdef
--------------------------+--------------------------------------+-------------------------------------------------------------------------------------------------------------------
 email_verification_codes | email_verification_codes_pkey        | CREATE UNIQUE INDEX email_verification_codes_pkey ON public.email_verification_codes USING btree (id)
 email_verification_codes | email_verification_codes_user_id_key | CREATE UNIQUE INDEX email_verification_codes_user_id_key ON public.email_verification_codes USING btree (user_id)
 password_reset_tokens    | password_reset_tokens_pkey           | CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)
 password_reset_tokens    | password_reset_tokens_token_hash_key | CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash)
 password_reset_tokens    | password_reset_tokens_user_id_idx    | CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id)
 sessions                 | sessions_pkey                        | CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id)
 sessions                 | sessions_user_id_idx                 | CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id)
 users                    | users_email_key                      | CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
 users                    | users_pkey                           | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
(9 rows)
```

## 2. The eight CHECK constraints, by name

1. `users_email_lowercase_trimmed` — `CHECK (email = lower(btrim(email)))`
2. `users_name_length` — `CHECK (char_length(name) BETWEEN 1 AND 80)`
3. `email_verification_codes_attempts_non_negative` — `CHECK (attempts >= 0)`
4. `email_verification_codes_expires_after_created` — `CHECK (expires_at > created_at)`
5. `password_reset_tokens_expires_after_created` — `CHECK (expires_at > created_at)`
6. `rate_limit_buckets_count_positive` — `CHECK (count > 0)`
7. `idempotency_keys_status_valid` — `CHECK (status IN ('processing', 'completed'))`
8. `idempotency_keys_completed_has_response` — `CHECK (status = 'processing' OR (response_status IS NOT NULL AND response_body IS NOT NULL))`

## 3. Negative-test SQL and the exact database errors

Each test runs inside its own `BEGIN ... ROLLBACK` so failing statements never leave a row behind, and no test depends on state left by another test. Run with:

```
docker compose exec -T db psql -U auth -d auth -v ON_ERROR_STOP=0 < constraint-tests.sql
```

### Test 1 — uppercase email → `users_email_lowercase_trimmed`

```sql
BEGIN;
INSERT INTO users (email, name, password_hash)
VALUES ('Foo@Example.com', 'Test User', 'argon2-hash-placeholder');
ROLLBACK;
```

```
BEGIN
ERROR:  new row for relation "users" violates check constraint "users_email_lowercase_trimmed"
DETAIL:  Failing row contains (a364794f-1112-4939-9a14-11743a9fe937, Foo@Example.com, Test User, argon2-hash-placeholder, null, 2026-09-16 11:21:04.436591+00, 2026-09-16 11:21:04.436591+00).
ROLLBACK
```

### Test 2 — email with leading whitespace → `users_email_lowercase_trimmed`

```sql
BEGIN;
INSERT INTO users (email, name, password_hash)
VALUES (' foo@example.com', 'Test User', 'argon2-hash-placeholder');
ROLLBACK;
```

```
BEGIN
ERROR:  new row for relation "users" violates check constraint "users_email_lowercase_trimmed"
DETAIL:  Failing row contains (cfe0047e-4351-41a2-b68b-9f49162c58c5,  foo@example.com, Test User, argon2-hash-placeholder, null, 2026-09-16 11:21:04.439935+00, 2026-09-16 11:21:04.439935+00).
ROLLBACK
```

### Test 3 — two users, same lowercase email → `users_email_key` (UNIQUE)

```sql
BEGIN;
INSERT INTO users (email, name, password_hash)
VALUES ('dup@example.com', 'First User', 'argon2-hash-placeholder');
INSERT INTO users (email, name, password_hash)
VALUES ('dup@example.com', 'Second User', 'argon2-hash-placeholder');
ROLLBACK;
```

```
BEGIN
INSERT 0 1
ERROR:  duplicate key value violates unique constraint "users_email_key"
DETAIL:  Key (email)=(dup@example.com) already exists.
ROLLBACK
```

### Test 4 — negative attempts → `email_verification_codes_attempts_non_negative`

```sql
BEGIN;
INSERT INTO users (id, email, name, password_hash)
VALUES ('11111111-1111-1111-1111-111111111111', 'verify-test@example.com', 'Verify Test', 'argon2-hash-placeholder');
INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at, attempts, last_sent_at)
VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'code-hash-placeholder', now() + interval '10 minutes', -1, now());
ROLLBACK;
```

```
BEGIN
INSERT 0 1
ERROR:  new row for relation "email_verification_codes" violates check constraint "email_verification_codes_attempts_non_negative"
DETAIL:  Failing row contains (5d8a88fa-7283-49b8-9f1f-da9e997bce7b, 11111111-1111-1111-1111-111111111111, code-hash-placeholder, 2026-09-16 11:31:04.442742+00, -1, 2026-09-16 11:21:04.442742+00, 2026-09-16 11:21:04.442742+00).
ROLLBACK
```

### Test 5 — second verification code for the same user → `email_verification_codes_user_id_key` (UNIQUE)

```sql
BEGIN;
INSERT INTO users (id, email, name, password_hash)
VALUES ('22222222-2222-2222-2222-222222222222', 'verify-test-2@example.com', 'Verify Test 2', 'argon2-hash-placeholder');
INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at, attempts, last_sent_at)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'code-hash-placeholder-1', now() + interval '10 minutes', 0, now());
INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at, attempts, last_sent_at)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'code-hash-placeholder-2', now() + interval '10 minutes', 0, now());
ROLLBACK;
```

```
BEGIN
INSERT 0 1
INSERT 0 1
ERROR:  duplicate key value violates unique constraint "email_verification_codes_user_id_key"
DETAIL:  Key (user_id)=(22222222-2222-2222-2222-222222222222) already exists.
ROLLBACK
```

### Cleanup check

```sql
SELECT count(*) AS leftover_users FROM users WHERE email LIKE '%example.com';
SELECT count(*) AS leftover_codes FROM email_verification_codes;
```

```
 leftover_users
----------------
              0
(1 row)

 leftover_codes
----------------
              0
(1 row)
```

Every test rolled back cleanly; the database has no rows left over from this evidence run.
