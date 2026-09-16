import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { authConfig } from "@/config/auth";

// Session tokens and reset tokens are 32 random bytes: 256 bits of entropy, infeasible to
// guess or brute-force even given only their SHA-256 hash. A verification code is only 6
// decimal digits -- 1,000,000 possible values, all of which can be hashed with plain SHA-256
// and compared to a stolen hash in well under a second. Keying the code's hash with a secret
// the attacker doesn't have (HMAC) is what makes brute-forcing it require the secret too, not
// just the hash. See DECISIONS.md, "Verification code hashing: HMAC-SHA256, not plain SHA-256".

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateVerificationCode(): string {
  // crypto.randomInt, never Math.random, per AGENTS.md rule 6.
  const code = randomInt(0, 10 ** authConfig.verificationCode.length);
  return code.toString().padStart(authConfig.verificationCode.length, "0");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

let cachedAuthSecret: Buffer | null = null;

// Validated and cached on first use, not at module import time, so `next build` and
// `tsc --noEmit` never depend on AUTH_SECRET being set in the environment they run in.
function getAuthSecret(): Buffer {
  if (cachedAuthSecret) return cachedAuthSecret;

  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"\n' +
        "and add it to .env.",
    );
  }

  // Decode first: a base64url string's character count is NOT its byte length (4 base64url
  // characters encode 3 bytes), so measuring the raw string's length would undercount the
  // actual entropy and could let a too-short secret slip through.
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length < 32) {
    throw new Error(
      `AUTH_SECRET decodes to only ${decoded.length} bytes; it must be at least 32. Generate a new one with:\n` +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }

  cachedAuthSecret = decoded;
  return decoded;
}

export function hmacCode(code: string): string {
  return createHmac("sha256", getAuthSecret()).update(code).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  // Lengths of hex-encoded hashes aren't secret (they're fixed by the algorithm), so returning
  // early on a length mismatch leaks nothing; timingSafeEqual itself throws on mismatched
  // lengths rather than returning false, so this check is required either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
