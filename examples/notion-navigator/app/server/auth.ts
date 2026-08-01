// @scelar-auth-scaffold v1 email=1 organizations=0
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@server/db";
import * as schema from "@server/schema";
import { sendEmail } from "@server/lib/email";

const authBaseURL =
  process.env.BETTER_AUTH_URL?.trim() || "http://localhost:5173";
const authSecret =
  process.env.BETTER_AUTH_SECRET?.trim() ||
  "scelar-dev-auth-secret-change-in-production-32chars";

/** Extra origins from TRUSTED_ORIGINS (comma-separated), plus Nodepod host defaults. */
function buildTrustedOrigins(baseURL: string): string[] {
  const fromEnv =
    process.env.TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return [
    ...new Set([
      baseURL,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      // Nodepod examples host (preview Origin is the host, not :5173)
      "http://localhost:3333",
      "http://127.0.0.1:3333",
      ...fromEnv,
    ]),
  ];
}

let auth: ReturnType<typeof betterAuth> | null = null;

export function ensureAuthReady() {
  if (!auth) {
    auth = betterAuth({
      database: drizzleAdapter(getDb(), {
        provider: "sqlite",
        schema,
      }),
      emailAndPassword: {
        enabled: true,
        // Keep false in sandbox so local sign-in works without clicking verify.
        // Verification emails still send on sign-up (see emailVerification.sendOnSignUp).
        requireEmailVerification: false,
        sendResetPassword: async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Reset your password",
            html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
            text: `Reset your password: ${url}`,
          });
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Verify your email",
            html: `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
            text: `Verify your email: ${url}`,
          });
        },
      },
      secret: authSecret,
      baseURL: authBaseURL,
      trustedOrigins: buildTrustedOrigins(authBaseURL),
      advanced: {
        // Preview is always http:// — never require Secure cookies in the sandbox.
        useSecureCookies: false,
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: false,
          path: "/",
        },
      },
    });
  }
  return auth;
}

export type Auth = ReturnType<typeof ensureAuthReady>;
