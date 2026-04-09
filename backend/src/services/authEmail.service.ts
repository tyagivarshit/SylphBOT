import nodemailer from "nodemailer";

const APP_NAME = "Automexia AI";
const DEFAULT_SUPPORT_EMAIL = "support@automexiaai.in";
const SMTP_HOST = process.env.SMTP_HOST || "smtppro.zoho.in";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : SMTP_PORT === 465;
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const EMAIL_FROM_NAME =
  process.env.EMAIL_FROM_NAME || `${APP_NAME} Security`;
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || EMAIL_FROM;
const EMAIL_SUPPORT_EMAIL =
  process.env.EMAIL_SUPPORT_EMAIL || EMAIL_REPLY_TO || DEFAULT_SUPPORT_EMAIL;
const EMAIL_RETRY_ATTEMPTS = Math.max(
  1,
  Number(process.env.EMAIL_RETRY_ATTEMPTS || 3)
);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  pool: true,
  maxConnections: 5,
  maxMessages: 200,
  connectionTimeout: 10000,
  greetingTimeout: 8000,
  socketTimeout: 15000,
  auth:
    EMAIL_USER && EMAIL_PASS
      ? {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        }
      : undefined,
});

let transportReadyPromise: Promise<void> | null = null;

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  category: string;
};

type EmailShellOptions = {
  preview: string;
  eyebrow: string;
  title: string;
  intro: string;
  details?: string[];
  ctaText: string;
  ctaUrl: string;
  rawLinkLabel: string;
  rawLinkUrl: string;
  footnote: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const runInBackground = (
  label: string,
  task: Promise<unknown>
) => {
  void task.catch((error) => {
    console.error(`[EMAIL] ${label} failed`, error);
  });
};

const ensureTransportReady = async () => {
  if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_FROM) {
    throw new Error(
      "Email transport is not configured. Set EMAIL_USER, EMAIL_PASS, and EMAIL_FROM."
    );
  }

  if (!transportReadyPromise) {
    transportReadyPromise = transporter
      .verify()
      .then(() => {
        console.log("[EMAIL] SMTP transport ready");
      })
      .catch((error) => {
        transportReadyPromise = null;
        console.error("[EMAIL] SMTP verification failed", error);
        throw error;
      });
  }

  return transportReadyPromise;
};

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  category,
}: MailPayload) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= EMAIL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await ensureTransportReady();

      const info = await transporter.sendMail({
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
        sender: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        to,
        subject,
        html,
        text,
        envelope: {
          from: EMAIL_FROM,
          to: [to],
        },
        headers: {
          "X-Automexia-Category": category,
        },
      });

      console.log("[EMAIL] sent", {
        category,
        to,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      });

      if (info.rejected?.length) {
        throw new Error(
          `Email rejected for recipients: ${info.rejected.join(", ")}`
        );
      }

      return info;
    } catch (error) {
      lastError = error;
      transportReadyPromise = null;

      console.error("[EMAIL] send attempt failed", {
        category,
        to,
        attempt,
        error:
          error instanceof Error ? error.message : "Unknown email error",
      });

      if (attempt < EMAIL_RETRY_ATTEMPTS) {
        await sleep(attempt * 1200);
      }
    }
  }

  throw lastError;
};

const renderButton = (url: string, text: string) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center" bgcolor="#0f6fff" style="border-radius:999px;">
        <a
          href="${escapeHtml(url)}"
          style="
            display:inline-block;
            padding:14px 26px;
            font-size:15px;
            font-weight:700;
            line-height:20px;
            color:#ffffff;
            text-decoration:none;
          "
        >
          ${escapeHtml(text)}
        </a>
      </td>
    </tr>
  </table>
`;

const renderDetailList = (items: string[] = []) => {
  if (!items.length) {
    return "";
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">
      ${items
        .map(
          (item) => `
            <tr>
              <td style="padding:0 0 10px 0;font-size:14px;line-height:22px;color:#475569;">
                - ${escapeHtml(item)}
              </td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
};

const buildEmailShell = ({
  preview,
  eyebrow,
  title,
  intro,
  details = [],
  ctaText,
  ctaUrl,
  rawLinkLabel,
  rawLinkUrl,
  footnote,
}: EmailShellOptions) => `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,'Segoe UI',sans-serif;color:#0f172a;">
      <span
        style="
          display:none;
          font-size:1px;
          line-height:1px;
          max-height:0;
          max-width:0;
          opacity:0;
          overflow:hidden;
        "
      >
        ${escapeHtml(preview)}
      </span>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f7fb;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">
              <tr>
                <td align="center" style="padding:0 0 18px 0;">
                  <div style="font-size:28px;line-height:32px;font-weight:800;color:#0f172a;">
                    ${APP_NAME}
                  </div>
                </td>
              </tr>

              <tr>
                <td
                  style="
                    background:#ffffff;
                    border:1px solid #dbe5f0;
                    border-radius:28px;
                    box-shadow:0 16px 48px rgba(15,23,42,0.08);
                    padding:36px 32px;
                  "
                >
                  <div
                    style="
                      display:inline-block;
                      padding:8px 12px;
                      border-radius:999px;
                      background:#e0ecff;
                      color:#0f6fff;
                      font-size:11px;
                      line-height:14px;
                      font-weight:700;
                      letter-spacing:0.08em;
                      text-transform:uppercase;
                    "
                  >
                    ${escapeHtml(eyebrow)}
                  </div>

                  <div style="padding:18px 0 0 0;font-size:30px;line-height:38px;font-weight:800;color:#0f172a;">
                    ${escapeHtml(title)}
                  </div>

                  <div style="padding:16px 0 0 0;font-size:15px;line-height:26px;color:#334155;">
                    ${escapeHtml(intro)}
                  </div>

                  ${renderDetailList(details)}
                  ${renderButton(ctaUrl, ctaText)}

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="padding:8px 0 0 0;">
                        <div style="font-size:12px;line-height:18px;color:#64748b;font-weight:600;margin-bottom:8px;">
                          ${escapeHtml(rawLinkLabel)}
                        </div>
                        <div
                          style="
                            word-break:break-all;
                            background:#f8fafc;
                            border:1px solid #e2e8f0;
                            border-radius:14px;
                            padding:14px 16px;
                            font-size:12px;
                            line-height:20px;
                            color:#0f172a;
                          "
                        >
                          ${escapeHtml(rawLinkUrl)}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 0 0 0;font-size:13px;line-height:22px;color:#64748b;">
                        ${escapeHtml(footnote)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" style="padding:18px 18px 0 18px;">
                  <div style="font-size:12px;line-height:18px;color:#64748b;">
                    Need help? Reply to ${escapeHtml(EMAIL_SUPPORT_EMAIL)}.
                  </div>
                  <div style="font-size:11px;line-height:18px;color:#94a3b8;padding-top:6px;">
                    ${APP_NAME} security and account notifications
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

const buildVerificationText = (verifyLink: string) => `
Verify your ${APP_NAME} email

Confirm your email address to activate your account and secure your workspace.
This verification link expires in 24 hours.

Verify email:
${verifyLink}

If you did not create this account, you can safely ignore this email.

Need help? Reply to ${EMAIL_SUPPORT_EMAIL}.
`.trim();

const buildPasswordResetText = (resetLink: string) => `
Reset your ${APP_NAME} password

We received a request to reset your password.
This reset link expires in 60 minutes.

Reset password:
${resetLink}

If you did not request this change, you can ignore this email and your password will remain unchanged.

Need help? Reply to ${EMAIL_SUPPORT_EMAIL}.
`.trim();

export const sendVerificationEmail = async (
  to: string,
  verifyLink: string
) => {
  await sendEmail({
    to,
    subject: `Verify your ${APP_NAME} email`,
    html: buildEmailShell({
      preview:
        "Confirm your email address to activate your Automexia AI account.",
      eyebrow: "Account verification",
      title: "Confirm your email address",
      intro:
        "Your account is almost ready. Verify your email to activate sign in and keep your workspace secure.",
      details: [
        "This verification link expires in 24 hours.",
        "You only need to verify once.",
        "If you did not create this account, you can safely ignore this message.",
      ],
      ctaText: "Verify email",
      ctaUrl: verifyLink,
      rawLinkLabel:
        "If the button does not open, copy and paste this secure link into your browser:",
      rawLinkUrl: verifyLink,
      footnote:
        "For security, only open verification links sent by Automexia AI.",
    }),
    text: buildVerificationText(verifyLink),
    category: "verify-email",
  });
};

export const queueVerificationEmail = (
  to: string,
  verifyLink: string
) => {
  runInBackground(
    `verification email to ${to}`,
    sendVerificationEmail(to, verifyLink)
  );
};

export const sendPasswordResetEmail = async (
  to: string,
  resetLink: string
) => {
  await sendEmail({
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: buildEmailShell({
      preview:
        "Use this secure link to reset your Automexia AI password.",
      eyebrow: "Password recovery",
      title: "Reset your password",
      intro:
        "We received a request to reset your password. Use the secure link below to choose a new one.",
      details: [
        "This reset link expires in 60 minutes.",
        "Your current password stays active until you complete the reset.",
        "If you did not request this change, you can ignore this email.",
      ],
      ctaText: "Reset password",
      ctaUrl: resetLink,
      rawLinkLabel:
        "If the button does not open, copy and paste this secure link into your browser:",
      rawLinkUrl: resetLink,
      footnote:
        "For your protection, this secure reset link can only be used before it expires.",
    }),
    text: buildPasswordResetText(resetLink),
    category: "reset-password",
  });
};

export const queuePasswordResetEmail = (
  to: string,
  resetLink: string
) => {
  runInBackground(
    `password reset email to ${to}`,
    sendPasswordResetEmail(to, resetLink)
  );
};