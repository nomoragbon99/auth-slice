/**
 * Manual smoke test for the security-core modules (task A1.3). Not a test suite -- just prints
 * evidence that each piece behaves as designed. Run with `npm run check:security`, which loads
 * .env via Node's --env-file flag (never prints any env value itself).
 *
 * Every row this script writes is prefixed "test:" (idempotency scope, rate-limit key) or uses
 * an obviously-fake email, and is deleted in the `finally` block at the end.
 */
import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateResetToken, generateSessionToken, generateVerificationCode, hmacCode, sha256Hex } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { consume } from "@/lib/security/rate-limit";
import { withIdempotency } from "@/lib/security/idempotency";

async function main() {
  console.log("\n--- 1. Password hashing (argon2id) ---");
  const plain = "Correct Horse Battery Staple 42";
  const start = Date.now();
  const hashed = await hashPassword(plain);
  const elapsedMs = Date.now() - start;
  console.log(`hash() took ${elapsedMs}ms`);
  console.log(`stored hash: ${hashed}`);
  console.log(`verifyPassword(hash, correct password) -> ${await verifyPassword(hashed, plain)}`);
  console.log(`verifyPassword(hash, wrong password)    -> ${await verifyPassword(hashed, "not the password")}`);
  console.log(`verifyPassword(malformed hash, anything) -> ${await verifyPassword("not-a-real-hash", plain)} (must be false, not throw)`);

  console.log("\n--- 2. Token and code formats ---");
  const sessionToken = generateSessionToken();
  const resetToken = generateResetToken();
  const code = generateVerificationCode();
  console.log(`session token (base64url, 32 bytes): ${sessionToken}`);
  console.log(`reset token   (base64url, 32 bytes): ${resetToken}`);
  console.log(`verification code (6 digits, zero-padded): ${code}`);
  console.log(`sha256Hex(session token): ${sha256Hex(sessionToken)}`);

  console.log("\n--- 3. hmacCode vs sha256Hex on the same code ---");
  const codeHmac = hmacCode(code);
  const codeSha256 = sha256Hex(code);
  console.log(`hmacCode(code):   ${codeHmac}`);
  console.log(`sha256Hex(code):  ${codeSha256}`);
  console.log(`different outputs for the same input -> ${codeHmac !== codeSha256}`);

  console.log("\n--- 4. Rate limiter (fixed window) ---");
  const rlKey = "test:ratelimit:demo";
  // A wide window (30s) so this whole demo reliably lands in one window regardless of how long
  // the earlier steps took -- a narrow window would occasionally (and correctly) split the 4
  // calls across a window boundary, which is the documented fixed-window trade-off, not a bug.
  const rlLimit = { windowSeconds: 30, max: 3 };
  for (let i = 1; i <= 4; i++) {
    const result = await consume(rlKey, rlLimit);
    console.log(
      `attempt ${i}: allowed=${result.allowed} remaining=${result.remaining} retryAfterSeconds=${result.retryAfterSeconds}`,
    );
  }

  console.log("\n--- 5. Idempotency replay ---");
  const scope = "test:demo";
  const idempotencyKey = "demo-key-1";
  const body = { hello: "world" };
  let handlerRunCount = 0;
  const handler = async () => {
    handlerRunCount++;
    return NextResponse.json({ handlerRunCount, message: "handled" }, { status: 200 });
  };

  const request1 = new NextRequest("http://localhost:3001/api/test", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
  const response1 = await withIdempotency(scope, request1, body, handler);
  console.log(`first call:  status=${response1.status} body=${JSON.stringify(await response1.json())}`);

  const request2 = new NextRequest("http://localhost:3001/api/test", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
  const response2 = await withIdempotency(scope, request2, body, handler);
  console.log(
    `second call: status=${response2.status} body=${JSON.stringify(await response2.json())} Idempotent-Replayed=${response2.headers.get("Idempotent-Replayed")}`,
  );
  console.log(`handler actually ran ${handlerRunCount} time(s) -> replay worked if this is 1`);
}

main()
  .catch((error) => {
    console.error("check-security-core failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log("\n--- cleanup ---");
    const buckets = await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "test:" } } });
    const keys = await db.idempotencyKey.deleteMany({ where: { scope: { startsWith: "test:" } } });
    console.log(`deleted ${buckets.count} rate_limit_buckets row(s), ${keys.count} idempotency_keys row(s)`);
    await db.$disconnect();
  });
