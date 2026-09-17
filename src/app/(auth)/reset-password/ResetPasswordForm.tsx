"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES, FOCUS_RING } from "@/components/auth/styles";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

type ResetPasswordResponse = { next: string };

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { form, formError, formErrorCode, submit, pushNext } = useAuthForm<ResetPasswordInput, ResetPasswordResponse>(
    resetPasswordSchema,
    { token, password: "", confirmPassword: "" },
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(data: ResetPasswordInput) {
    const result = await submit("/api/auth/reset-password", data);
    if (result.ok) pushNext(router, result.data);
  }

  const tokenInvalid = formErrorCode === "TOKEN_INVALID_OR_EXPIRED";

  return (
    <AuthCard heading="Choose a new password">
      {formError && <FormAlert variant="error" message={formError} />}
      {tokenInvalid && (
        <p className="mb-4 text-sm">
          <Link href="/forgot-password" className={`text-blue-600 underline ${FOCUS_RING}`}>
            Request a new reset link
          </Link>
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <input type="hidden" {...register("token")} />
        <FormField id="password" label="New password" error={errors.password?.message}>
          <input
            {...register("password")}
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASSES}
          />
        </FormField>
        <FormField id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
          <input
            {...register("confirmPassword")}
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASSES}
          />
        </FormField>
        <SubmitButton pending={isSubmitting}>Reset password</SubmitButton>
      </form>
    </AuthCard>
  );
}
