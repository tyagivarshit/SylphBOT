import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

/* ================= TRANSPORT (UNCHANGED) ================= */

const transporter = nodemailer.createTransport({
  host: "smtppro.zoho.in",
  port: 465,
  secure: true,
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const runInBackground = (
  label: string,
  task: Promise<unknown>
) => {
  void task.catch((error) => {
    console.error(`[EMAIL] ${label} failed`, error);
  });
};

/* ================= STRIPE-LEVEL BASE TEMPLATE ================= */

const baseTemplate = (content: string) => `
  <div style="background:#f6f9fc;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    
    <div style="max-width:560px;margin:auto;">
      
      <!-- HEADER -->
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="
          font-size:20px;
          font-weight:600;
          color:#111827;
          margin:0;
        ">
          Automexia AI
        </h1>
      </div>

      <!-- CARD -->
      <div style="
        background:#ffffff;
        border-radius:12px;
        padding:28px;
        border:1px solid #e5e7eb;
        box-shadow:0 2px 8px rgba(0,0,0,0.04);
      ">

        ${content}

      </div>

      <!-- FOOTER -->
      <div style="text-align:center;margin-top:20px;">
        <p style="font-size:12px;color:#6b7280;margin:0;">
          Automexia AI Support • support@automexiaai.in
        </p>

        <p style="font-size:11px;color:#9ca3af;margin-top:6px;">
          © ${new Date().getFullYear()} Automexia AI. All rights reserved.
        </p>
      </div>

    </div>
  </div>
`;

/* ================= STRIPE BUTTON ================= */

const button = (link: string, text: string) => `
  <div style="text-align:center;margin:24px 0;">
    <a href="${link}" 
       style="
         display:inline-block;
         padding:12px 20px;
         background:#635bff;
         color:#ffffff;
         border-radius:8px;
         text-decoration:none;
         font-weight:500;
         font-size:14px;
       ">
      ${text}
    </a>
  </div>
`;

/* ================= VERIFY EMAIL ================= */

export const sendVerificationEmail = async (to: string, verifyLink: string) => {
  const html = baseTemplate(`
    <h2 style="font-size:18px;font-weight:600;color:#111;margin-bottom:10px;">
      Verify your email
    </h2>

    <p style="color:#4b5563;font-size:14px;line-height:1.6;">
      Welcome to <strong>Automexia AI</strong> 🚀<br/>
      Confirm your email to activate your account.
    </p>

    ${button(verifyLink, "Verify Email")}

    <p style="font-size:12px;color:#6b7280;margin-top:20px;">
      If the button doesn’t work, copy this link:
    </p>

    <p style="word-break:break-all;font-size:11px;color:#9ca3af;">
      ${verifyLink}
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexia AI Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Verify your email - Automexia AI",
    html,
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

/* ================= RESET PASSWORD ================= */

export const sendPasswordResetEmail = async (to: string, resetLink: string) => {
  const html = baseTemplate(`
    <h2 style="font-size:18px;font-weight:600;color:#111;margin-bottom:10px;">
      Reset your password
    </h2>

    <p style="color:#4b5563;font-size:14px;">
      We received a request to reset your password.
    </p>

    ${button(resetLink, "Reset Password")}

    <p style="margin-top:20px;font-size:12px;color:#6b7280;">
      If you didn’t request this, you can ignore this email.
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexia AI Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Reset your password - Automexia AI",
    html,
  });
};

/* ================= SUBSCRIPTION ================= */

export const sendSubscriptionEmail = async (to: string, plan: string) => {
  const html = baseTemplate(`
    <h2 style="font-size:18px;font-weight:600;color:#111;margin-bottom:10px;">
      Subscription Activated 🎉
    </h2>

    <p style="color:#4b5563;font-size:14px;">
      You are now on the <strong>${plan}</strong> plan.
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexia AI Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Subscription Activated - Automexia AI",
    html,
  });
};

/* ================= PDF + INVOICE ================= */

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

const generateInvoicePDF = async ({ amount, currency, email }: any) => {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();

    const buffers: Uint8Array[] = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 50, 45, { width: 120 });
    }

    doc.fontSize(20).text("INVOICE", 400, 50, { align: "right" });

    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Customer: ${email}`)
      .text(`Date: ${new Date().toLocaleDateString()}`)
      .moveDown();

    doc.fontSize(14).text(
      `Total: ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`
    );

    doc.moveDown();

    doc.fontSize(12).text("Thank you for choosing Automexia AI 🚀", {
      align: "center",
    });

    doc.end();
  });
};

export const sendInvoiceEmail = async (
  to: string,
  amount: number,
  currency: string,
  hostedUrl?: string | null,
  pdfUrl?: string | null,
  subtotal?: number,
  taxAmount?: number,
  taxType?: string
) => {
  const pdfBuffer = await generateInvoicePDF({
    amount,
    currency,
    email: to,
  });

  const html = baseTemplate(`
  <h2 style="font-size:18px;font-weight:600;color:#111;margin-bottom:10px;">
    Payment Successful 💳
  </h2>

  <p style="color:#4b5563;font-size:14px;">
    Total Paid: 
    <strong>${currency.toUpperCase()} ${(amount / 100).toFixed(2)}</strong>
  </p>

  ${
    subtotal !== undefined
      ? `<p style="font-size:13px;color:#6b7280;">
          Subtotal: ${currency.toUpperCase()} ${(subtotal / 100).toFixed(2)}
        </p>`
      : ""
  }

  ${
    taxAmount !== undefined
      ? `<p style="font-size:13px;color:#6b7280;">
          Tax (${taxType || "GST"}): ${currency.toUpperCase()} ${(taxAmount / 100).toFixed(2)}
        </p>`
      : ""
  }

  ${
    hostedUrl
      ? `
        <div style="text-align:center;margin:20px 0;">
          <a href="${hostedUrl}" style="
            display:inline-block;
            padding:10px 16px;
            background:#635bff;
            color:#fff;
            border-radius:6px;
            text-decoration:none;
            font-size:13px;
          ">
            View Invoice
          </a>
        </div>
      `
      : ""
  }

  ${
    pdfUrl
      ? `
        <div style="text-align:center;margin:10px 0;">
          <a href="${pdfUrl}" style="
            display:inline-block;
            padding:10px 16px;
            background:#111827;
            color:#fff;
            border-radius:6px;
            text-decoration:none;
            font-size:13px;
          ">
            Download PDF
          </a>
        </div>
      `
      : ""
  }

  <p style="font-size:12px;color:#6b7280;margin-top:20px;">
    Thank you for choosing Automexia AI 🚀
  </p>
`);

  await transporter.sendMail({
    from: `"Automexia AI Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your Invoice - Automexia AI",
    html,
    attachments: [
      {
        filename: "invoice.pdf",
        content: pdfBuffer,
      },
    ],
  });
};
