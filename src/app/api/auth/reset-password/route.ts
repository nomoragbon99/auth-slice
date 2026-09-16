import type { NextRequest } from "next/server";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json, validationError } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { sha256Hex } from "@/lib/auth/tokens";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";
import { resetPasswordSchema } from "@/lib/validation/auth";

const TOKEN_INVALID_OR_EXPIRED = () =>
  errorResponse(400, "TOKEN_INVALID_OR_EXPIRED", "This reset link is invalid or has expired.");

// Thrown only to abort the transaction when the conditional update below loses a race; caught
// by name, never lets a real error masquerade as this one.
class TokenAlreadyConsumedError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const ip = getClientIp(request);
    const limit = await consume(`reset:ip:${ip}`, authConfig.rateLimits.resetPerIp);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error);
    const { token, password } = parsed.data;

    const tokenHash = sha256Hex(token);
    const tokenRow = await db.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });

    // One message covers "never existed", "already used", and "expired" -- distinguishing them
    // would let a guess be narrowed down by response content.
    if (!tokenRow) return TOKEN_INVALID_OR_EXPIRED();

    // Only reached once a live token is confirmed, so this expensive step is never wasted on a
    // doomed request.
    const passwordHash = await hashPassword(password);

    try {
      await db.$transaction(async (tx) => {
        // Conditional update guards against two requests racing to consume the same token:
        // only the first can match `used_at IS NULL`; the loser affects 0 rows and aborts here.
        const affected = await tx.$executeRaw`
          UPDATE password_reset_tokens SET used_at = now()
          WHERE id = ${tokenRow.id} AND used_at IS NULL
        `;
        if (affected !== 1) throw new TokenAlreadyConsumedError();

        await tx.user.update({ where: { id: tokenRow.userId }, data: { passwordHash } });

        // A password reset invalidates every existing session, not just this device's.
        await tx.session.deleteMany({ where: { userId: tokenRow.userId } });
      });
    } catch (error) {
      if (error instanceof TokenAlreadyConsumedError) return TOKEN_INVALID_OR_EXPIRED();
      throw error;
    }

    return json(200, { next: "/sign-in?reset=success" });
  } catch (error) {
    console.error("POST /api/auth/reset-password failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
