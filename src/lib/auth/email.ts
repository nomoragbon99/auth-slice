import { Resend } from "resend";

function getFrom(): string {
  return process.env.EMAIL_FROM || "Auth Slice <onboarding@resend.dev>";
}

async function send(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Clearly marked so nobody mistakes this for a real send during local development.
    console.log(
      `\n===== DEV EMAIL (not sent) =====\nTo: ${to}\nFrom: ${getFrom()}\nSubject: ${subject}\n\n${text}\n=================================\n`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({ from: getFrom(), to, subject, text });
}

export function sendVerificationCode(to: string, name: string, code: string): Promise<void> {
  return send(
    to,
    "Your verification code",
    `Hi ${name},\n\nYour verification code is: ${code}\n\nThis code expires soon. If you didn't request this, you can ignore this email.`,
  );
}

export function sendPasswordReset(to: string, name: string, link: string): Promise<void> {
  return send(
    to,
    "Reset your password",
    `Hi ${name},\n\nUse this link to reset your password:\n${link}\n\nThis link expires soon. If you didn't request this, you can ignore this email.`,
  );
}
