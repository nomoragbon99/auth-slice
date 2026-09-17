/**
 * Evidence for getSafeRedirectPath's open-redirect protection. curl can't exercise this: the
 * ?next= check runs in the browser's sign-in form, not on the server, so calling it directly
 * here is the only way to prove its behavior for each input. Run with:
 *   npx tsx scripts/check-safe-redirect.ts
 */
import { getSafeRedirectPath } from "@/lib/security/safe-redirect";

const FALLBACK = "/dashboard";

const cases: Array<string | null> = [
  "/dashboard",
  "//evil.example",
  "/\\evil.example",
  "https://evil.example",
  "javascript:alert(1)",
  "",
  null,
  "dashboard",
];

console.log(`fallback used for every rejected input: ${FALLBACK}\n`);
console.log("input".padEnd(28) + "output");
console.log("-".repeat(50));
for (const input of cases) {
  const label = input === null ? "null" : JSON.stringify(input);
  const output = getSafeRedirectPath(input, FALLBACK);
  console.log(label.padEnd(28) + output);
}
