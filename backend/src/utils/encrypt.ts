import crypto from "crypto";

const algorithm = "aes-256-cbc";
const secret = process.env.JWT_SECRET as string; // reuse for simplicity

const key = crypto.createHash("sha256").update(secret).digest();
const iv = Buffer.alloc(16, 0);

export const encrypt = (text: string) => {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

export const decrypt = (encryptedText: string) => {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};