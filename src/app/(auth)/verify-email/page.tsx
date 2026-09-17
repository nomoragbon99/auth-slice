import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { VerifyEmailForm } from "./VerifyEmailForm";

// Server-side gate, per AGENTS.md: nobody without a session reaches this page, and nobody who's
// already verified sees a stale "enter your code" form.
// force-dynamic for the same reason as dashboard/page.tsx: this page's content depends on
// session/verification state, so it must never be cached or statically served.
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.emailVerifiedAt) redirect("/dashboard");

  return <VerifyEmailForm email={user.email} />;
}
