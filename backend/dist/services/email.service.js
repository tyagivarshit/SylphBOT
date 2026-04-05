"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceEmail = exports.sendSubscriptionEmail = exports.sendPasswordResetEmail = exports.sendVerificationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/* ================= TRANSPORT (UNCHANGED) ================= */
const transporter = nodemailer_1.default.createTransport({
    host: "smtppro.zoho.in",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
/* ================= STRIPE-LEVEL BASE TEMPLATE ================= */
const baseTemplate = (content) => `
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
const button = (link, text) => `
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
const sendVerificationEmail = async (to, verifyLink) => {
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
exports.sendVerificationEmail = sendVerificationEmail;
/* ================= RESET PASSWORD ================= */
const sendPasswordResetEmail = async (to, resetLink) => {
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
exports.sendPasswordResetEmail = sendPasswordResetEmail;
/* ================= SUBSCRIPTION ================= */
const sendSubscriptionEmail = async (to, plan) => {
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
exports.sendSubscriptionEmail = sendSubscriptionEmail;
/* ================= PDF + INVOICE ================= */
const LOGO_PATH = path_1.default.join(process.cwd(), "public", "logo.png");
const generateInvoicePDF = async ({ amount, currency, email }) => {
    return new Promise((resolve) => {
        const doc = new pdfkit_1.default();
        const buffers = [];
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        if (fs_1.default.existsSync(LOGO_PATH)) {
            doc.image(LOGO_PATH, 50, 45, { width: 120 });
        }
        doc.fontSize(20).text("INVOICE", 400, 50, { align: "right" });
        doc.moveDown();
        doc
            .fontSize(12)
            .text(`Customer: ${email}`)
            .text(`Date: ${new Date().toLocaleDateString()}`)
            .moveDown();
        doc.fontSize(14).text(`Total: ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`);
        doc.moveDown();
        doc.fontSize(12).text("Thank you for choosing Automexia AI 🚀", {
            align: "center",
        });
        doc.end();
    });
};
const sendInvoiceEmail = async (to, amount, currency) => {
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
      Total Paid: <strong>${currency.toUpperCase()} ${(amount / 100).toFixed(2)}</strong>
    </p>

    <p style="font-size:12px;color:#6b7280;">
      Your invoice is attached below 📎
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
exports.sendInvoiceEmail = sendInvoiceEmail;
