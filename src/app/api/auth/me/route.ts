import { errorResponse, json } from "@/lib/http";
import { validateSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const auth = await validateSession();
    if (!auth) return errorResponse(401, "UNAUTHENTICATED", "You must be signed in.");
    return json(200, { user: auth.user });
  } catch (error) {
    console.error("GET /api/auth/me failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
