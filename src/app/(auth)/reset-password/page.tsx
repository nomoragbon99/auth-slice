import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FOCUS_RING } from "@/components/auth/styles";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Next.js 16: searchParams is a Promise on a Server Component page and must be awaited.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthCard heading="Reset link missing">
        <p className="text-sm text-gray-600">
          This link is missing its reset token. Request a new one to reset your password.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className={`text-blue-600 underline ${FOCUS_RING}`}>
            Request a new reset link
          </Link>
        </p>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token} />;
}
