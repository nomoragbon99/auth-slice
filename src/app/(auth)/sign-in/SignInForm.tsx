"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES, FOCUS_RING } from "@/components/auth/styles";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";

type SignInResponse = { next: string };

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";

  const { form, formError, submit } = useAuthForm<SignInInput, SignInResponse>(signInSchema, {
    email: "",
    password: "",
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(data: SignInInput) {
    const result = await submit("/api/auth/signin", data);
    if (result.ok) router.push(result.data.next);
  }

  return (
    <AuthCard heading="Sign in">
      {resetSuccess && (
        <FormAlert variant="success" message="Your password has been reset. Sign in with your new password." />
      )}
      {formError && <FormAlert variant="error" message={formError} />}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField id="email" label="Email" error={errors.email?.message}>
          <input {...register("email")} type="email" autoComplete="email" className={INPUT_CLASSES} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASSES}
          />
        </FormField>
        <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 flex justify-between text-sm text-gray-600">
        <Link href="/sign-up" className={`text-blue-600 underline ${FOCUS_RING}`}>
          Create an account
        </Link>
        <Link href="/forgot-password" className={`text-blue-600 underline ${FOCUS_RING}`}>
          Forgot password?
        </Link>
      </p>
    </AuthCard>
  );
}
