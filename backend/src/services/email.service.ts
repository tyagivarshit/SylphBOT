import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

/* ================= TRANSPORT ================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= BASE TEMPLATE ================= */

const baseTemplate = (content: string) => `
  <div style="background:#f4f8ff;padding:40px 0;font-family:Inter,Arial,sans-serif;">
    
    <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:14px;padding:30px;border:1px solid #e6eefc;">
      
      <h1 style="
        text-align:center;
        font-size:26px;
        font-weight:800;
        background: linear-gradient(90deg,#0A1F44,#1E90FF,#00C6FF);
        -webkit-background-clip:text;
        color:transparent;
        margin-bottom:20px;
      ">
        Automexa
      </h1>

      ${content}

      <p style="margin-top:30px;font-size:12px;color:#999;text-align:center;">
        © ${new Date().getFullYear()} Automexa. All rights reserved.
      </p>

    </div>
  </div>
`;

/* ================= BUTTON ================= */

const button = (link: string, text: string) => `
  <div style="text-align:center;margin-top:20px;">
    <a href="${link}" 
       style="
         display:inline-block;
         padding:12px 22px;
         background:linear-gradient(90deg,#1E90FF,#00C6FF);
         color:white;
         border-radius:8px;
         text-decoration:none;
         font-weight:600;
         font-size:14px;
       ">
      ${text}
    </a>
  </div>
`;

/* ================= VERIFY EMAIL ================= */

export const sendVerificationEmail = async (to: string, verifyLink: string) => {
  const html = baseTemplate(`
    <h2 style="text-align:center;margin-bottom:10px;">Verify your email</h2>

    <p style="text-align:center;color:#555;">
      Welcome to Automexa 🚀 <br/>
      Please confirm your email to activate your account.
    </p>

    ${button(verifyLink, "Verify Email")}
  `);

  await transporter.sendMail({
    from: `"Automexa" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Verify your email - Automexa",
    html,
  });
};

/* ================= RESET PASSWORD ================= */

export const sendPasswordResetEmail = async (to: string, resetLink: string) => {
  const html = baseTemplate(`
    <h2 style="text-align:center;margin-bottom:10px;">Reset your password</h2>

    <p style="text-align:center;color:#555;">
      We received a request to reset your password.
    </p>

    ${button(resetLink, "Reset Password")}

    <p style="margin-top:15px;text-align:center;font-size:12px;color:#888;">
      If you didn’t request this, you can ignore this email.
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexa" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Reset your password - Automexa",
    html,
  });
};

/* ================= SUBSCRIPTION ================= */

export const sendSubscriptionEmail = async (to: string, plan: string) => {
  const html = baseTemplate(`
    <h2 style="text-align:center;margin-bottom:10px;">Subscription Activated 🎉</h2>

    <p style="text-align:center;color:#555;">
      You are now on the <strong>${plan}</strong> plan.
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexa" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Subscription Activated - Automexa",
    html,
  });
};

/* ================= PDF + INVOICE ================= */

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

const generateInvoicePDF = async ({
  amount,
  currency,
  email,
}: any) => {
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

    doc.fontSize(12).text("Thank you for choosing Automexa 🚀", {
      align: "center",
    });

    doc.end();
  });
};

export const sendInvoiceEmail = async (
  to: string,
  amount: number,
  currency: string
) => {
  const pdfBuffer = await generateInvoicePDF({
    amount,
    currency,
    email: to,
  });

  const html = baseTemplate(`
    <h2 style="text-align:center;margin-bottom:10px;">Payment Successful 💳</h2>

    <p style="text-align:center;color:#555;">
      Total Paid: <strong>${currency.toUpperCase()} ${(amount / 100).toFixed(2)}</strong>
    </p>

    <p style="text-align:center;font-size:12px;color:#888;">
      Invoice attached below 📎
    </p>
  `);

  await transporter.sendMail({
    from: `"Automexa" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your Invoice - Automexa",
    html,
    attachments: [
      {
        filename: "invoice.pdf",
        content: pdfBuffer,
      },
    ],
  });
};