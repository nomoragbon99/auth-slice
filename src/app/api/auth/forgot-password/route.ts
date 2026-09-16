import { after, type NextRequest } from "next/server";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse, json, validationError } from "@/lib/http";
import { generateResetToken, sha256Hex } from "@/lib/auth/tokens";
import { sendPasswordReset } from "@/lib/auth/email";
import { assertSameOrigin } from "@/lib/security/origin";
import { consume, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation/auth";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const ip = getClientIp(request);
    const ipLimit = await consume(`forgot:ip:${ip}`, authConfig.rateLimits.forgotPerIp);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = forgotPasswordSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error);
    const { email } = parsed.data;

    const emailLimit = await consume(`forgot:email:${email}`, authConfig.rateLimits.forgotPerEmail);
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSeconds);

    // The actual lookup/token/email work runs AFTER this response is sent (via after()), so its
    // duration can never be observed in the response time -- doing it inline would leak account
    // existence through timing even though the response body is identical either way.
    after(async () => {
      try {
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return;

        // Only the user's UNUSED tokens are cleared -- used/expired ones stay, per the
        // password_reset_tokens design (see DECISIONS.md).
        await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

        const rawToken = generateResetToken();
        await db.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256Hex(rawToken),
            expiresAt: new Date(Date.now() + authConfig.passwordReset.tokenTtlSeconds * 1000),
          },
        });

        const link = `${process.env.APP_URL}/reset-password?token=${rawToken}`;
        await sendPasswordReset(user.email, user.name, link);
      } catch (error) {
        // Nothing can be reported to the client at this point -- the response was already
        // sent. Logged server-side only.
        console.error("forgot-password deferred work failed:", error);
      }
    });

    // Always the same response, whether or not the account exists -- this is the actual
    // privacy guarantee (AGENTS.md rule 5), not just a nice-to-have.
    return json(200, { message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("POST /api/auth/forgot-password failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
