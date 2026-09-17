"use client";

import { useEffect } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { FOCUS_RING } from "@/components/auth/styles";

// Catches an unexpected error thrown while rendering any page (e.g. a Server Component's
// getCurrentUser() failing during a DB outage) and shows this instead of Next's own default
// error UI, so the app's plain, consistent style holds even when something goes wrong.
// `retry` (stable since Next 16.3, per the installed version's own docs) re-attempts rendering
// the segment that failed, without a full page reload.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthCard heading="Something went wrong">
      <p className="mb-4 text-sm text-gray-600">An unexpected error occurred. Please try again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className={`w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 ${FOCUS_RING}`}
      >
        Try again
      </button>
    </AuthCard>
  );
}
