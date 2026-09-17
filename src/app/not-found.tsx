import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FOCUS_RING } from "@/components/auth/styles";

export default function NotFound() {
  return (
    <AuthCard heading="Page not found">
      <p className="mb-4 text-sm text-gray-600">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/sign-in" className={`text-blue-600 underline ${FOCUS_RING}`}>
        Go to sign in
      </Link>
    </AuthCard>
  );
}
