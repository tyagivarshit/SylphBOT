"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAsync = void 0;
const retryAsync = async (fn, retries = 3, delayMs = 1000) => {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < retries) {
                await new Promise((res) => setTimeout(res, delayMs * attempt));
            }
        }
    }
    throw lastError;
};
exports.retryAsync = retryAsync;
