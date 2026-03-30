import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= LOGO PATH ================= */

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

/* ================= PDF GENERATOR ================= */

const generateInvoicePDF = async ({
  amount,
  currency,
  email,
  subtotal,
  taxAmount,
  taxType,
}: {
  amount: number;
  currency: string;
  email: string;
  subtotal?: number;
  taxAmount?: number;
  taxType?: string;
}) => {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();

    const buffers: Uint8Array[] = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    /* LOGO */
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

    doc.fontSize(16).text("Payment Details", { underline: true }).moveDown();

    doc
      .fontSize(14)
      .text(`Total: ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`);

    if (subtotal !== undefined) {
      doc.text(
        `Subtotal: ${currency.toUpperCase()} ${(subtotal / 100).toFixed(2)}`
      );
    }

    if (taxAmount !== undefined) {
      doc.text(
        `${taxType || "Tax"}: ${currency.toUpperCase()} ${(
          taxAmount / 100
        ).toFixed(2)}`
      );
    }

    doc.moveDown();

    doc.fontSize(12).text("Thank you for choosing Sylph AI 🚀", {
      align: "center",
    });

    doc.end();
  });
};

/* ================= VERIFY EMAIL ================= */

export const sendVerificationEmail = async (
  to: string,
  verifyLink: string
) => {
  try {
    await transporter.sendMail({
      from: `"Sylph AI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Verify Your Email - Sylph AI",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome to Sylph AI 🚀</h2>
          <p>Please verify your email to activate your account.</p>
          <a href="${verifyLink}" style="padding:10px 20px;background:#2563eb;color:#fff;border-radius:5px;">
            Verify Email
          </a>
        </div>
      `,
    });
  } catch (error) {
    throw new Error("Email sending failed");
  }
};

/* ================= PASSWORD RESET ================= */

export const sendPasswordResetEmail = async (
  to: string,
  resetLink: string
) => {
  try {
    await transporter.sendMail({
      from: `"Sylph AI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Reset Your Password - Sylph AI",
      html: `<a href="${resetLink}">Reset Password</a>`,
    });
  } catch {
    throw new Error("Password reset email failed");
  }
};

/* ================= SUBSCRIPTION ================= */

export const sendSubscriptionEmail = async (
  to: string,
  plan: string
) => {
  try {
    await transporter.sendMail({
      from: `"Sylph AI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Subscription Activated 🚀",
      html: `<h2>You are now on ${plan} plan 🎉</h2>`,
    });
  } catch {}
};

/* ================= 🔥 INVOICE EMAIL ================= */

export const sendInvoiceEmail = async (
  to: string,
  amount: number,
  currency: string,
  invoiceUrl?: string,
  pdfUrl?: string,
  subtotal?: number,
  taxAmount?: number,
  taxType?: string
) => {
  try {
    const pdfBuffer = await generateInvoicePDF({
      amount,
      currency,
      email: to,
      subtotal,
      taxAmount,
      taxType,
    });

    await transporter.sendMail({
      from: `"Sylph AI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Your Invoice - Sylph AI",
      html: `
        <div style="font-family: Arial; padding:20px;">
          
          <h2>Payment Successful 💳</h2>

          <p>
            <strong>Total:</strong> ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}
          </p>

          ${
            subtotal !== undefined
              ? `<p>Subtotal: ${currency.toUpperCase()} ${(subtotal / 100).toFixed(2)}</p>`
              : ""
          }

          ${
            taxAmount !== undefined
              ? `<p>${taxType || "Tax"}: ${currency.toUpperCase()} ${(taxAmount / 100).toFixed(2)}</p>`
              : ""
          }

          <div style="margin-top:15px;">
            ${
              invoiceUrl
                ? `<a href="${invoiceUrl}" style="margin-right:10px;">View Invoice</a>`
                : ""
            }

            ${
              pdfUrl
                ? `<a href="${pdfUrl}">Stripe PDF</a>`
                : ""
            }
          </div>

          <p style="margin-top:20px;">Invoice attached below 📎</p>

        </div>
      `,
      attachments: [
        {
          filename: "invoice.pdf",
          content: pdfBuffer,
        },
      ],
    });

    console.log("✅ Custom invoice sent:", to);
  } catch (error) {
    console.error("❌ Invoice email failed:", error);
  }
};