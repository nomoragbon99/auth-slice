"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FOCUS_RING } from "@/components/auth/styles";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      const body = await response.json().catch(() => ({ next: "/sign-in" }));
      router.push(body.next ?? "/sign-in");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 ${FOCUS_RING}`}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
