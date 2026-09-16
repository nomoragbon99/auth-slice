import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";
import { generateVerificationCode, hmacCode } from "@/lib/auth/tokens";
import { validateSession } from "@/lib/auth/session";
import { sendVerificationCode } from "@/lib/auth/email";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, rateLimitResponse } from "@/lib/security/rate-limit";

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

    const limit = await consume(`resend:user:${user.id}`, authConfig.rateLimits.resendPerUser);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    const cooldownSeconds = authConfig.verificationCode.resendCooldownSeconds;
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + authConfig.verificationCode.ttlSeconds * 1000);

    // One conditional UPDATE does the cooldown check and the replace atomically: two resend
    // requests racing each other can't both succeed, because only one can match
    // `last_sent_at <= now() - cooldown` before the other's (or its own) write moves
    // last_sent_at forward.
    const updated = await db.$queryRaw<{ id: string }[]>`
      UPDATE email_verification_codes
      SET code_hash = ${hmacCode(code)}, attempts = 0, expires_at = ${expiresAt}, last_sent_at = now()
      WHERE user_id = ${user.id}
        AND last_sent_at <= now() - (${cooldownSeconds} * interval '1 second')
      RETURNING id
    `;

    if (updated.length > 0) {
      await sendVerificationCode(user.email, user.name, code);
      return json(200, { cooldownSeconds });
    }

    // The update matched no row: either the user has no code row at all (insert one, no
    // cooldown to respect since none existed), or one exists and its cooldown hasn't elapsed.
    const existing = await db.emailVerificationCode.findUnique({ where: { userId: user.id } });

    if (!existing) {
      try {
        await db.emailVerificationCode.create({
          data: {
            userId: user.id,
            codeHash: hmacCode(code),
            attempts: 0,
            expiresAt,
            lastSentAt: new Date(),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // Lost a race to insert the first-ever code row for this user -- fall through to the
          // cooldown response below using whatever the winner just wrote.
          return cooldownResponse(user.id, cooldownSeconds);
        }
        throw error;
      }
      await sendVerificationCode(user.email, user.name, code);
      return json(200, { cooldownSeconds });
    }

    return cooldownResponse(user.id, cooldownSeconds, existing.lastSentAt);
  } catch (error) {
    console.error("POST /api/auth/resend-code failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

async function cooldownResponse(userId: string, cooldownSeconds: number, knownLastSentAt?: Date) {
  const lastSentAt =
    knownLastSentAt ?? (await db.emailVerificationCode.findUnique({ where: { userId } }))?.lastSentAt ?? new Date();
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((lastSentAt.getTime() + cooldownSeconds * 1000 - Date.now()) / 1000),
  );
  return rateLimitResponse(retryAfterSeconds);
}
