"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES, FOCUS_RING } from "@/components/auth/styles";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

type SignUpResponse = { user: { name: string; email: string }; next: string };

export default function SignUpPage() {
  const router = useRouter();
  const { form, formError, submit } = useAuthForm<SignUpInput, SignUpResponse>(signUpSchema, {
    name: "",
    email: "",
    password: "",
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  // One key per signup attempt-series, not per click: it stays the same across retries so a
  // double-click or a retry after a network blip is deduplicated, but rotates once the server
  // gives a FINAL answer that isn't success (see DECISIONS.md) so a corrected resubmit is never
  // blocked by IDEMPOTENCY_KEY_REUSED against the earlier, wrong body.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function onSubmit(data: SignUpInput) {
    const result = await submit("/api/auth/signup", data, { "Idempotency-Key": idempotencyKey });
    if (result.ok) {
      router.push(result.data.next);
      return;
    }
    if (!result.networkError) {
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  return (
    <AuthCard heading="Create your account">
      {formError && <FormAlert variant="error" message={formError} />}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField id="name" label="Name" error={errors.name?.message}>
          <input {...register("name")} type="text" autoComplete="name" className={INPUT_CLASSES} />
        </FormField>
        <FormField id="email" label="Email" error={errors.email?.message}>
          <input {...register("email")} type="email" autoComplete="email" className={INPUT_CLASSES} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <input
            {...register("password")}
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASSES}
          />
        </FormField>
        <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/sign-in" className={`text-blue-600 underline ${FOCUS_RING}`}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
