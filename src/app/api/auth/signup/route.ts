import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json, validationError } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { generateVerificationCode, hmacCode } from "@/lib/auth/tokens";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { sendVerificationCode } from "@/lib/auth/email";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";
import { withIdempotency } from "@/lib/security/idempotency";
import { signUpSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    // Counted before validation: every POST spends one unit of budget, valid body or not, so
    // an attacker can't probe validation for free.
    const ip = getClientIp(request);
    const limit = await consume(`signup:ip:${ip}`, authConfig.rateLimits.signupPerIp);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = signUpSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error);
    const { name, email, password } = parsed.data;

    return withIdempotency("signup", request, parsed.data, async () => {
      // The single expensive step, only reached after origin, rate limit, validation and the
      // idempotency dedup check have all passed.
      const passwordHash = await hashPassword(password);
      const code = generateVerificationCode();

      let userId: string;
      try {
        // One transaction: a user is never created without its verification code, and vice
        // versa -- either both rows exist or neither does.
        const user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({ data: { name, email, passwordHash } });
          await tx.emailVerificationCode.create({
            data: {
              userId: created.id,
              codeHash: hmacCode(code),
              expiresAt: new Date(Date.now() + authConfig.verificationCode.ttlSeconds * 1000),
              lastSentAt: new Date(),
            },
          });
          return created;
        });
        userId = user.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // Returned, not thrown: withIdempotency stores this as a completed response, so a
          // retried signup with the same Idempotency-Key keeps getting the same 409.
          return errorResponse(409, "EMAIL_TAKEN", "An account with this email already exists.");
        }
        throw error;
      }

      // Only after the transaction has committed -- email is a slow network call, and a
      // transaction should never stay open waiting on one.
      await sendVerificationCode(email, name, code);

      const { token, expiresAt } = await createSession(userId);
      await setSessionCookie(token, expiresAt);

      return json(201, { user: { name, email }, next: "/verify-email" });
    });
  } catch (error) {
    console.error("POST /api/auth/signup failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
