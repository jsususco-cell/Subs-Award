import nodemailer from "nodemailer";

/**
 * Outbound mail. SERVER ONLY — reads the sending credentials.
 *
 * Three ways to send, in order of preference:
 *
 *   1. n8n webhook. No mail credential lives in this app at all — n8n already
 *      holds one, and its execution log becomes the send audit trail.
 *   2. Google service account with domain-wide delegation. No human
 *      credential, revocable on its own, but a Workspace super-admin has to
 *      authorise the service account first.
 *   3. Google App Password. Simplest, but it belongs to one person's account
 *      and dies when that password changes. Gmail rejects a normal account
 *      password with 535-5.7.8 — it must be an App Password, needing 2FA.
 */

export type MailMode = "n8n" | "service-account" | "app-password" | "unconfigured";

/**
 * The scope a delegated service account must be authorised for. SMTP with
 * XOAUTH2 requires full-mailbox access; Gmail will not accept a send-only
 * scope over SMTP, so sending with a narrower scope means using the Gmail API
 * instead. nodemailer already defaults to exactly this, so it is not passed —
 * @types/nodemailer has no `scope` property even though the runtime reads one.
 */
export const SMTP_SCOPE = "https://mail.google.com/";

function privateKey(): string {
  // Env vars cannot hold real newlines, so JSON keys arrive with "\n" escaped.
  return (process.env.GMAIL_SERVICE_ACCOUNT_KEY ?? "").replace(/\\n/g, "\n").trim();
}

export const MAIL_CONFIG = {
  webhookUrl: process.env.N8N_SEND_WEBHOOK_URL ?? "",
  webhookToken: process.env.N8N_WEBHOOK_TOKEN ?? "",
  /** The mailbox mail is sent from — impersonated, under a service account. */
  user: process.env.GMAIL_USER ?? "",
  pass: process.env.GMAIL_APP_PASSWORD ?? "",
  serviceClient: process.env.GMAIL_SERVICE_ACCOUNT_EMAIL ?? "",
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

export function mailMode(): MailMode {
  if (MAIL_CONFIG.webhookUrl) return "n8n";
  if (!MAIL_CONFIG.user) return "unconfigured";
  if (MAIL_CONFIG.serviceClient && privateKey()) return "service-account";
  if (MAIL_CONFIG.pass) return "app-password";
  return "unconfigured";
}

export function isMailConfigured(): boolean {
  return mailMode() !== "unconfigured";
}

/** What is missing, in words, when nothing is configured. */
export function missingMailConfig(): string {
  return (
    "Email is not configured. Set N8N_SEND_WEBHOOK_URL to send through n8n, " +
    "or GMAIL_USER plus either GMAIL_APP_PASSWORD (a Google App Password, not " +
    "the account password) or GMAIL_SERVICE_ACCOUNT_EMAIL and " +
    "GMAIL_SERVICE_ACCOUNT_KEY."
  );
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

export async function sendMail(
  input: SendInput,
): Promise<{ messageId: string; mode: MailMode }> {
  const mode = mailMode();
  if (mode === "n8n") return { messageId: await sendViaN8n(input), mode };

  const info = await smtpTransport().sendMail({
    from: `"${MAIL_CONFIG.fromName}" <${MAIL_CONFIG.user}>`,
    to: input.to.join(", "),
    ...(input.cc.length ? { cc: input.cc.join(", ") } : {}),
    subject: input.subject,
    text: input.text,
    html: textToHtml(input.text),
    attachments: input.attachments,
  });
  return { messageId: info.messageId, mode };
}

/**
 * Hand the message to n8n, which owns the mail credential.
 *
 * The webhook can send mail as the company, so it must not be open: n8n's
 * webhook node should require the header token this sends.
 */
async function sendViaN8n(input: SendInput): Promise<string> {
  const res = await fetch(MAIL_CONFIG.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MAIL_CONFIG.webhookToken
        ? { "x-webhook-token": MAIL_CONFIG.webhookToken }
        : {}),
    },
    body: JSON.stringify({
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
      fromName: MAIL_CONFIG.fromName,
      attachments: input.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: a.content.toString("base64"),
      })),
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`n8n webhook ${res.status}: ${body.slice(0, 300)}`);
  }

  try {
    const parsed = JSON.parse(body) as { messageId?: string; id?: string };
    return parsed.messageId ?? parsed.id ?? "sent via n8n";
  } catch {
    return "sent via n8n";
  }
}

/**
 * Gmail's SMTP endpoint, stated explicitly rather than through the "gmail"
 * service shorthand, which nodemailer's types will not accept alongside an
 * OAuth2 auth block. The options are written out in each branch because a
 * spread defeats the overload resolution.
 */
function smtpTransport() {
  if (mailMode() === "service-account") {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: MAIL_CONFIG.user,
        serviceClient: MAIL_CONFIG.serviceClient,
        privateKey: privateKey(),
      },
    });
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: MAIL_CONFIG.user, pass: MAIL_CONFIG.pass },
  });
}

/** Turn a send failure into something actionable. */
export function explainSendError(message: string): string {
  if (/n8n webhook 401|n8n webhook 403/i.test(message)) {
    return " n8n rejected the request — check that N8N_WEBHOOK_TOKEN matches the header auth on the webhook node.";
  }
  if (/n8n webhook 404/i.test(message)) {
    return " n8n returned 404 — the workflow is probably not active, or the URL is the test webhook rather than the production one.";
  }
  if (/535|BadCredentials/i.test(message)) {
    return mailMode() === "app-password"
      ? " Gmail rejected the credentials — GMAIL_APP_PASSWORD must be a Google App Password, which requires 2FA on the account."
      : " Gmail rejected the service account. Check that a Workspace super-admin has authorised its client ID for domain-wide delegation with the https://mail.google.com/ scope.";
  }
  if (/invalid_grant|unauthorized_client/i.test(message)) {
    return " The service account is not authorised to impersonate this mailbox. A Workspace super-admin must add its client ID under Security → API controls → Domain-wide delegation with the https://mail.google.com/ scope.";
  }
  return "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  const body = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#101d35">${body}</div>`;
}
