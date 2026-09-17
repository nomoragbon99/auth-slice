import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignOutButton } from "./SignOutButton";

// Temporary placeholder for A1.5's manual testing; A1.6 replaces this with the real dashboard.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
      <p className="text-lg text-gray-900">Signed in as {user.name}</p>
      <SignOutButton />
    </div>
  );
}
