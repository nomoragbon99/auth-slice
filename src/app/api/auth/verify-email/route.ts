import type { NextRequest } from "next/server";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json, validationError } from "@/lib/http";
import { hmacCode, safeEqualHex } from "@/lib/auth/tokens";
import { validateSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, rateLimitResponse } from "@/lib/security/rate-limit";
import { verifyCodeSchema } from "@/lib/validation/auth";

type ConsumeAttemptRow = { code_hash: string; attempts: number };

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const auth = await validateSession();
    if (!auth) return errorResponse(401, "UNAUTHENTICATED", "You must be signed in.");
    const { user } = auth;

    if (user.emailVerifiedAt !== null) {
      return errorResponse(400, "ALREADY_VERIFIED", "This email is already verified.");
    }

    const limit = await consume(`verify:user:${user.id}`, authConfig.rateLimits.verifyPerUser);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = verifyCodeSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error);
    const { code } = parsed.data;

    // Consume the attempt atomically BEFORE comparing: parallel guesses each get their own
    // increment from this one statement, so attempts can never exceed maxAttempts no matter
    // how many requests race each other. Only a request that actually consumed an attempt
    // (got a row back) goes on to compare the code.
    const rows = await db.$queryRaw<ConsumeAttemptRow[]>`
      UPDATE email_verification_codes
      SET attempts = attempts + 1
      WHERE user_id = ${user.id}
        AND attempts < ${authConfig.verificationCode.maxAttempts}
        AND expires_at > now()
      RETURNING code_hash, attempts
    `;

    if (rows.length === 0) {
      // The atomic update matched no row -- find out why, for the response only. This read
      // never mutates anything, so it can't itself be raced.
      const existing = await db.emailVerificationCode.findUnique({ where: { userId: user.id } });
      if (!existing) {
        return errorResponse(400, "CODE_INVALID", "Request a new verification code.");
      }
      if (existing.expiresAt <= new Date()) {
        return errorResponse(400, "CODE_EXPIRED", "This code has expired. Request a new one.");
      }
      return errorResponse(400, "TOO_MANY_ATTEMPTS", "Too many attempts. Request a new code.");
    }

    const { code_hash: codeHash, attempts } = rows[0];

    if (!safeEqualHex(hmacCode(code), codeHash)) {
      // attemptsRemaining goes in the message, not a new top-level field: AGENTS.md's error
      // shape only defines `fields` for Zod-style per-field validation messages, and this
      // isn't one -- a plain number doesn't fit `Record<string, string[]>` without inventing
      // a shape nothing else in this API uses.
      const attemptsRemaining = authConfig.verificationCode.maxAttempts - attempts;
      const plural = attemptsRemaining === 1 ? "attempt" : "attempts";
      return errorResponse(
        400,
        "CODE_INVALID",
        `That code is incorrect. ${attemptsRemaining} ${plural} remaining.`,
      );
    }

    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
      db.emailVerificationCode.delete({ where: { userId: user.id } }),
    ]);

    return json(200, { next: "/dashboard" });
  } catch (error) {
    console.error("POST /api/auth/verify-email failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
