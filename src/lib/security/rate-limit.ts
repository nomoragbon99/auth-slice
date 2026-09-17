import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type RateLimit = { windowSeconds: number; max: number };

export type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

// Fixed window, not sliding: each key gets one row per windowSeconds-wide bucket. Chosen over
// a sliding window because it needs one row and one atomic statement per key -- a sliding
// window needs either a sorted set of timestamps or two overlapping buckets to approximate.
// Trade-off (recorded in DECISIONS.md): a client can burst up to 2x max requests across a
// window boundary (max at the end of one window, max again at the start of the next).
export async function consume(key: string, limit: RateLimit): Promise<ConsumeResult> {
  const windowMs = limit.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  // One atomic parameterised statement: INSERT the first hit in this window, or increment the
  // existing row's count, and return the resulting count -- no read-then-write race between
  // concurrent requests for the same key.
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count
  `;
  const count = rows[0].count;

  void cleanupOldBucketsOncePerInterval();

  const allowed = count <= limit.max;
  const remaining = Math.max(0, limit.max - count);
  const retryAfterSeconds = allowed
    ? 0
    : Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);

  return { allowed, remaining, retryAfterSeconds };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  const response = errorResponse(
    429,
    "RATE_LIMITED",
    "Too many requests. Please try again later.",
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;

// Opportunistic cleanup, at most once every 5 minutes per process: piggybacks on a normal
// request instead of needing a separate scheduled job for this slice's scale.
// This is called fire-and-forget (`void cleanupOldBucketsOncePerInterval()`) from every rate
// limit check, so a rejection here with nothing catching it would be an unhandled promise
// rejection on nearly every mutating request. Catch and log instead -- a failed cleanup sweep
// is not worth failing (or even slowing down) the request that happened to trigger it.
async function cleanupOldBucketsOncePerInterval(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  try {
    await db.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: new Date(now - BUCKET_RETENTION_MS) } },
    });
  } catch (error) {
    console.error("rate-limit bucket cleanup failed:", error);
  }
}

export function getClientIp(request: NextRequest): string {
  // Only trustworthy behind a proxy you control that sets/overwrites this header itself --
  // otherwise a client can put anything it likes in it. Fine for this slice's local/dev use;
  // a real deployment behind a trusted proxy (e.g. Vercel) should be verified against that
  // proxy's own documented header.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
