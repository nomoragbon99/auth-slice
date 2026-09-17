"use client";

import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES, FOCUS_RING } from "@/components/auth/styles";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

type ForgotPasswordResponse = { message: string };

export default function ForgotPasswordPage() {
  const { form, formError, formSuccess, setFormSuccess, submit } = useAuthForm<
    ForgotPasswordInput,
    ForgotPasswordResponse
  >(forgotPasswordSchema, { email: "" });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(data: ForgotPasswordInput) {
    // The server always answers 200 with the same message whether or not the account exists --
    // that's the actual privacy guarantee (built in the API), this just displays it verbatim.
    const result = await submit("/api/auth/forgot-password", data);
    if (result.ok) setFormSuccess(result.data.message);
  }

  return (
    <AuthCard heading="Forgot your password?">
      {formSuccess && <FormAlert variant="success" message={formSuccess} />}
      {formError && <FormAlert variant="error" message={formError} />}
      {!formSuccess && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <FormField id="email" label="Email" error={errors.email?.message}>
            <input {...register("email")} type="email" autoComplete="email" className={INPUT_CLASSES} />
          </FormField>
          <SubmitButton pending={isSubmitting}>Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-4 text-sm text-gray-600">
        <Link href="/sign-in" className={`text-blue-600 underline ${FOCUS_RING}`}>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
