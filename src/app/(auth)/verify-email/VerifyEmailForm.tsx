"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES, FOCUS_RING } from "@/components/auth/styles";
import { verifyCodeSchema, type VerifyCodeInput } from "@/lib/validation/auth";

type VerifyResponse = { next: string };
type ResendResponse = { cooldownSeconds: number };

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const { form, formError, submit } = useAuthForm<VerifyCodeInput, VerifyResponse>(verifyCodeSchema, {
    code: "",
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  // The countdown's STARTING number always comes from a server response (cooldownSeconds on
  // success, or the Retry-After header on 429) -- never a value invented here.
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function onSubmit(data: VerifyCodeInput) {
    const result = await submit("/api/auth/verify-email", data);
    if (result.ok) router.push(result.data.next);
  }

  async function onResend() {
    setResendPending(true);
    setResendError(null);
    try {
      const response = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        setCooldownSeconds(Number.isFinite(retryAfter) ? retryAfter : 0);
        setResendError("Please wait before requesting another code.");
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResendError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      const { cooldownSeconds: serverCooldown } = body as ResendResponse;
      setCooldownSeconds(serverCooldown);
    } catch {
      setResendError("Network error. Check your connection and try again.");
    } finally {
      setResendPending(false);
    }
  }

  return (
    <AuthCard heading="Verify your email">
      <p className="mb-4 text-sm text-gray-600">
        We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span>.
      </p>
      {formError && <FormAlert variant="error" message={formError} />}
      {resendError && <FormAlert variant="error" message={resendError} />}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField id="code" label="Verification code" error={errors.code?.message}>
          <input
            {...register("code")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={INPUT_CLASSES}
          />
        </FormField>
        <SubmitButton pending={isSubmitting}>Verify</SubmitButton>
      </form>
      <button
        type="button"
        onClick={onResend}
        disabled={resendPending || cooldownSeconds > 0}
        className={`mt-4 text-sm text-blue-600 underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline ${FOCUS_RING}`}
      >
        {cooldownSeconds > 0 ? `Resend code (${cooldownSeconds}s)` : "Resend code"}
      </button>
    </AuthCard>
  );
}
