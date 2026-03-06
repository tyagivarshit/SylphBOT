import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
          <a href="${verifyLink}" 
             style="
               display:inline-block;
               padding:10px 20px;
               background-color:#2563eb;
               color:#ffffff;
               text-decoration:none;
               border-radius:5px;
             ">
             Verify Email
          </a>
          <p style="margin-top:20px;font-size:12px;color:gray;">
            This link will expire in 24 hours.
          </p>
        </div>
      `,
    });

    console.log("Verification email sent to:", to);
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("Email sending failed");
  }
};