import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const MAIL_DIR = "/.scelar/mail";

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export type SendEmailResult = {
  id: string;
  mode: "local" | "resend";
};

function resolveMode(): "local" | "resend" {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? "resend" : "local";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Send email via Resend when RESEND_API_KEY + EMAIL_FROM are set;
 * otherwise write a real local message under /.scelar/mail for the Email tab.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const id = randomUUID();
  const mode = resolveMode();
  const text =
    input.text?.trim() ||
    (input.html ? stripHtml(input.html) : "") ||
    input.subject;

  if (mode === "resend") {
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from = process.env.EMAIL_FROM!.trim();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html ?? `<p>${text}</p>`,
        text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Resend failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { id: data?.id ?? id, mode: "resend" };
  }

  mkdirSync(MAIL_DIR, { recursive: true });
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const path = `${MAIL_DIR}/${safeStamp}-${id}.json`;
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        id,
        to: input.to,
        subject: input.subject,
        html: input.html ?? `<p>${text}</p>`,
        text,
        createdAt,
        mode: "local",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { id, mode: "local" };
}
