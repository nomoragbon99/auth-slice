import { z } from "zod";
import { authConfig } from "@/config/auth";

// z.email() (not the deprecated z.string().email()) is Zod 4's current top-level email
// validator. Trim/lowercase run first so " Foo@Bar.com " and "foo@bar.com" validate and land
// in the database as the same value -- matching the users_email_lowercase_trimmed CHECK.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }));

// Matches the users_name_length CHECK (char_length BETWEEN 1 AND 80) so a name the database
// would reject is caught here first, with a friendly message instead of a raw SQL error.
const name = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(80, "Name must be 80 characters or fewer.");

const password = z
  .string()
  .min(authConfig.password.minLength, `Password must be at least ${authConfig.password.minLength} characters.`)
  .max(authConfig.password.maxLength, `Password must be ${authConfig.password.maxLength} characters or fewer.`);

export const signUpSchema = z.object({ name, email, password });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset link is missing its token."),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
