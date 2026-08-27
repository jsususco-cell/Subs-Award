import nodemailer from "nodemailer";

/**
 * Outbound mail. SERVER ONLY — reads the Gmail app password.
 *
 * Gmail rejects a normal account password with 535-5.7.8; this needs a Google
 * App Password, which requires 2FA on the sending account.
 */

export const MAIL_CONFIG = {
  user: process.env.GMAIL_USER ?? "",
  pass: process.env.GMAIL_APP_PASSWORD ?? "",
  fromName: process.env.MAIL_FROM_NAME ?? "Byrdson Services",
  /**
   * Optional rollout rail. When set, only these addresses can be written to —
   * everything else is refused rather than delivered. Leave unset in normal
   * operation; set it while testing so a real subcontractor cannot be mailed
   * by accident.
   */
  allowlist: (process.env.LETTER_SEND_ALLOWLIST ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
};

export function isMailConfigured(): boolean {
  return MAIL_CONFIG.user.length > 0 && MAIL_CONFIG.pass.length > 0;
}

/** Deliberately conservative: one address, no display names, no folding. */
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;

export function isEmail(value: string): boolean {
  return EMAIL.test((value ?? "").trim());
}

/** Split a comma or semicolon separated list into trimmed addresses. */
export function parseRecipients(value: string): string[] {
  return (value ?? "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export interface RecipientCheck {
  ok: boolean;
  invalid: string[];
  blocked: string[];
}

/** Validate every address and apply the allowlist, if one is configured. */
export function checkRecipients(addresses: string[]): RecipientCheck {
  const invalid = addresses.filter((a) => !isEmail(a));
  const blocked = MAIL_CONFIG.allowlist.length
    ? addresses.filter(
        (a) => isEmail(a) && !MAIL_CONFIG.allowlist.includes(a.toLowerCase()),
      )
    : [];
  return { ok: invalid.length === 0 && blocked.length === 0, invalid, blocked };
}

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendInput {
  to: string[];
  cc: string[];
  subject: string;
  /** Plain-text body; a minimal HTML version is derived from it. */
  text: string;
  attachments: Attachment[];
}

export async function sendMail(input: SendInput): Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: MAIL_CONFIG.user, pass: MAIL_CONFIG.pass },
  });

  const info = await transport.sendMail({
    from: `"${MAIL_CONFIG.fromName}" <${MAIL_CONFIG.user}>`,
    to: input.to.join(", "),
    ...(input.cc.length ? { cc: input.cc.join(", ") } : {}),
    subject: input.subject,
    text: input.text,
    html: textToHtml(input.text),
    attachments: input.attachments,
  });

  return { messageId: info.messageId };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  const body = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#101d35">${body}</div>`;
}
