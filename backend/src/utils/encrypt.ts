import crypto from "crypto";
import { kmsProviderRouterService } from "../services/security/kmsProviderRouter.service";

const algorithm = "aes-256-cbc";
const secret = process.env.JWT_SECRET as string; // reuse for simplicity

const key = crypto.createHash("sha256").update(secret).digest();
const iv = Buffer.alloc(16, 0);

const legacyEncrypt = (text: string) => {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

const legacyDecrypt = (encryptedText: string) => {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

const stripEncryptedPrefix = (value: string) => {
  const normalized = String(value || "").trim();
  return normalized.startsWith("enc::")
    ? normalized.slice("enc::".length)
    : normalized;
};

const resolveKmsKeyId = () =>
  String(process.env.KMS_DEFAULT_KEY_ID || process.env.JWT_SECRET || "default")
    .trim()
    .toLowerCase();

export const encrypt = (text: string) => {
  const plaintext = String(text || "");
  const result = kmsProviderRouterService.encryptEnvelope({
    plaintext,
    keyId: resolveKmsKeyId(),
    context: {
      secretPath: "utils.encrypt",
      reason: "runtime_encryption",
    },
  });
  return result.ciphertext;
};

export const decrypt = (encryptedText: string) => {
  const normalized = stripEncryptedPrefix(encryptedText);
  const usesKmsEnvelope = normalized.startsWith("kms::");

  if (usesKmsEnvelope) {
    const result = kmsProviderRouterService.decryptEnvelope({
      ciphertext: normalized,
      context: {
        secretPath: "utils.decrypt",
        reason: "runtime_decryption",
      },
    });
    return result.plaintext;
  }

  try {
    return legacyDecrypt(normalized);
  } catch {
    return normalized;
  }
};

export const __encryptionLegacyFallback = {
  legacyEncrypt,
  legacyDecrypt,
};
