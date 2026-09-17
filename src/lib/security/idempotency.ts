import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { authConfig } from "@/config/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";

type Handler = () => Promise<NextResponse>;

// A client-supplied header used as a database primary-key component; without a cap, an
// oversized value would sit in idempotency_keys indefinitely (up to its retention period).
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

// Runs `handler` at most once per (scope, Idempotency-Key) pair. A retried request with the
// same key and the same body replays the first response instead of repeating the mutation;
// the same key with a DIFFERENT body is rejected, since silently replaying the wrong response
// would be worse than refusing the request outright.
export async function withIdempotency(
  scope: string,
  request: NextRequest,
  parsedBody: unknown,
  handler: Handler,
): Promise<NextResponse> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) {
    // No key supplied: just run the handler. For this slice the unique email constraint on
    // signup is the backstop against an accidental double-submit.
    return handler();
  }

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `Idempotency-Key must be ${MAX_IDEMPOTENCY_KEY_LENGTH} characters or fewer.`,
    );
  }

  const requestHash = createHash("sha256").update(JSON.stringify(parsedBody)).digest("hex");

  try {
    await db.idempotencyKey.create({
      data: {
        scope,
        key,
        requestHash,
        status: "processing",
        expiresAt: new Date(Date.now() + authConfig.idempotency.retentionSeconds * 1000),
      },
    });
  } catch {
    // Primary key (scope, key) already exists -- load it to decide what to do.
    const existing = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });

    if (!existing) {
      // Vanishingly unlikely (deleted between the failed insert and this read); treat as if
      // no key was ever supplied.
      return handler();
    }

    if (existing.requestHash !== requestHash) {
      return errorResponse(
        422,
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used with a different request body.",
      );
    }

    if (existing.status === "processing") {
      return errorResponse(
        409,
        "REQUEST_IN_PROGRESS",
        "A request with this Idempotency-Key is already being processed.",
      );
    }

    // status === "completed": replay the stored response.
    // A replayed response never carries a Set-Cookie header. The original Set-Cookie (e.g. a
    // session token) is a raw credential -- storing it in idempotency_keys so it could be
    // replayed would put a working credential at rest in this table, defeating the whole point
    // of storing only token hashes everywhere else in this schema. The client that made the
    // original request already received and stored that cookie; a retry doesn't need it again.
    const response = errorResponseFromStored(existing.responseStatus!, existing.responseBody);
    response.headers.set("Idempotent-Replayed", "true");
    return response;
  }

  try {
    const response = await handler();
    const body = await response.clone().json();
    await db.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: { status: "completed", responseStatus: response.status, responseBody: body },
    });
    return response;
  } catch (error) {
    // The handler failed before completing -- delete the processing row so the client can
    // simply retry with the same key instead of being stuck behind a row that will never
    // reach "completed".
    await db.idempotencyKey.delete({ where: { scope_key: { scope, key } } }).catch(() => {});
    throw error;
  }
}

function errorResponseFromStored(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status });
}
