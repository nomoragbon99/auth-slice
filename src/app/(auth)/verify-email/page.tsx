import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { VerifyEmailForm } from "./VerifyEmailForm";

// Server-side gate, per AGENTS.md: nobody without a session reaches this page, and nobody who's
// already verified sees a stale "enter your code" form.
export default async function VerifyEmailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.emailVerifiedAt) redirect("/dashboard");

  return <VerifyEmailForm email={user.email} />;
}
