// Every tunable value for the auth slice. Handlers import from here; no magic numbers elsewhere.
// All durations are in seconds so they line up with HTTP's Retry-After header.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type RateLimit = {
  /** Length of the counting window, in seconds. */
  windowSeconds: number;
  /** Maximum attempts allowed inside one window. */
  max: number;
};

export const authConfig = {
  session: {
    // Sessions last 7 days from sign-in, fixed: activity does not extend them.
    lifetimeSeconds: 7 * DAY,
    // Unique per project because browsers share localhost cookies across ports.
    cookieName: "auth_slice_session",
  },

  verificationCode: {
    // Number of digits in the emailed verification code.
    length: 6,
    // How long a code stays valid after it is sent.
    ttlSeconds: 10 * MINUTE,
    // Wrong guesses allowed before the code is invalidated.
    maxAttempts: 5,
    // Minimum wait between two "resend code" requests.
    resendCooldownSeconds: 60,
  },

  passwordReset: {
    // How long an emailed reset link stays usable.
    tokenTtlSeconds: 30 * MINUTE,
  },

  argon2: {
    // Memory per hash in KiB (19 MiB), OWASP minimum for argon2id.
    memoryCost: 19456,
    // Number of passes over memory, OWASP minimum paired with 19 MiB.
    timeCost: 2,
    // Threads per hash, OWASP minimum recommendation.
    parallelism: 1,
  },

  rateLimits: {
    // Sign-in attempts for one email from one IP: slows password guessing on one account.
    signinPerIpEmail: { windowSeconds: 15 * MINUTE, max: 5 },
    // Sign-in attempts from one IP across all emails: slows spraying many accounts.
    signinPerIp: { windowSeconds: 15 * MINUTE, max: 20 },
    // Accounts created from one IP: limits mass sign-ups.
    signupPerIp: { windowSeconds: HOUR, max: 5 },
    // Forgot-password requests from one IP: limits email flooding from one source.
    forgotPerIp: { windowSeconds: HOUR, max: 5 },
    // Forgot-password requests for one email: protects one inbox from being spammed.
    forgotPerEmail: { windowSeconds: HOUR, max: 3 },
    // Verification code resends for one user: limits email volume per account.
    resendPerUser: { windowSeconds: HOUR, max: 5 },
    // Code submissions for one user: backstop against guessing across fresh codes.
    verifyPerUser: { windowSeconds: 15 * MINUTE, max: 10 },
    // Reset-password submissions from one IP: slows reset token guessing.
    resetPerIp: { windowSeconds: HOUR, max: 10 },
  } satisfies Record<string, RateLimit>,

  idempotency: {
    // How long a stored Idempotency-Key response is kept for replay.
    retentionSeconds: 24 * HOUR,
  },

  password: {
    // Shortest password accepted (NIST SP 800-63B minimum).
    minLength: 8,
    // Longest password accepted; caps hashing work per request.
    maxLength: 128,
  },
} as const;
