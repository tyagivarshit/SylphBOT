"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__encryptionLegacyFallback = exports.decrypt = exports.encrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
const kmsProviderRouter_service_1 = require("../services/security/kmsProviderRouter.service");
const algorithm = "aes-256-cbc";
const secret = process.env.JWT_SECRET; // reuse for simplicity
const key = crypto_1.default.createHash("sha256").update(secret).digest();
const iv = Buffer.alloc(16, 0);
const legacyEncrypt = (text) => {
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
};
const legacyDecrypt = (encryptedText) => {
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
};
const stripEncryptedPrefix = (value) => {
    const normalized = String(value || "").trim();
    return normalized.startsWith("enc::")
        ? normalized.slice("enc::".length)
        : normalized;
};
const resolveKmsKeyId = () => String(process.env.KMS_DEFAULT_KEY_ID || process.env.JWT_SECRET || "default")
    .trim()
    .toLowerCase();
const encrypt = (text) => {
    const plaintext = String(text || "");
    const result = kmsProviderRouter_service_1.kmsProviderRouterService.encryptEnvelope({
        plaintext,
        keyId: resolveKmsKeyId(),
        context: {
            secretPath: "utils.encrypt",
            reason: "runtime_encryption",
        },
    });
    return result.ciphertext;
};
exports.encrypt = encrypt;
const decrypt = (encryptedText) => {
    const normalized = stripEncryptedPrefix(encryptedText);
    const usesKmsEnvelope = normalized.startsWith("kms::");
    if (usesKmsEnvelope) {
        const result = kmsProviderRouter_service_1.kmsProviderRouterService.decryptEnvelope({
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
    }
    catch {
        return normalized;
    }
};
exports.decrypt = decrypt;
exports.__encryptionLegacyFallback = {
    legacyEncrypt,
    legacyDecrypt,
};
