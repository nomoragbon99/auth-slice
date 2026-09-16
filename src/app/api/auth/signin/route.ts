import type { NextRequest } from "next/server";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json, validationError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";
import { signInSchema } from "@/lib/validation/auth";

// Computed once, on first use, and reused for every sign-in of a nonexistent email: verifying
// against a real argon2id hash costs the same CPU time whether or not the account exists, so
// response time can't be used to enumerate registered emails. Not a real password -- its value
// is never checked against anything, only its hash's shape (cost, memory, salt length) matters.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  return (dummyHashPromise ??= hashPassword("dummy-password-for-constant-time-signin-only"));
}

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const ip = getClientIp(request);
    const ipLimit = await consume(`signin:ip:${ip}`, authConfig.rateLimits.signinPerIp);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = signInSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error);
    const { email, password } = parsed.data;

    const ipEmailLimit = await consume(
      `signin:ip-email:${ip}:${email}`,
      authConfig.rateLimits.signinPerIpEmail,
    );
    if (!ipEmailLimit.allowed) return rateLimitResponse(ipEmailLimit.retryAfterSeconds);

    const user = await db.user.findUnique({ where: { email } });

    const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);

    if (!user || !passwordOk) {
      // Identical response whether the email doesn't exist or the password is wrong.
      return errorResponse(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }

    const { token, expiresAt } = await createSession(user.id);
    await setSessionCookie(token, expiresAt);

    return json(200, { next: user.emailVerifiedAt ? "/dashboard" : "/verify-email" });
  } catch (error) {
    console.error("POST /api/auth/signin failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
