"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePassport = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const prisma_1 = __importDefault(require("./prisma"));
const env_1 = require("./env");
const GOOGLE_CALLBACK_URL = env_1.env.BACKEND_URL
    ? `${env_1.env.BACKEND_URL}/api/auth/google/callback`
    : "http://localhost:5000/api/auth/google/callback";
let passportConfigured = false;
const configurePassport = () => {
    if (passportConfigured) {
        return;
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.warn("Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing");
        return;
    }
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ["profile", "email"],
    }, async (_accessToken, _refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value?.trim().toLowerCase();
            const displayName = String(profile.displayName || "").trim() ||
                String(profile.name?.givenName || "").trim() ||
                email?.split("@")[0] ||
                "Workspace Owner";
            const avatarUrl = String(profile.photos?.[0]?.value || "").trim() || null;
            if (!email) {
                return done(new Error("Google account has no email"));
            }
            let user = await prisma_1.default.user.findUnique({
                where: { email },
            });
            if (!user) {
                const randomPassword = crypto_1.default.randomBytes(32).toString("hex");
                user = await prisma_1.default.user.create({
                    data: {
                        email,
                        name: displayName,
                        password: await bcryptjs_1.default.hash(randomPassword, 12),
                        isVerified: true,
                        avatar: avatarUrl,
                    },
                });
            }
            else {
                const updateData = {};
                if (!user.isVerified) {
                    updateData.isVerified = true;
                    updateData.verifyToken = null;
                    updateData.verifyTokenExpiry = null;
                }
                if (displayName && user.name !== displayName) {
                    updateData.name = displayName;
                }
                if (avatarUrl && user.avatar !== avatarUrl) {
                    updateData.avatar = avatarUrl;
                }
                if (user.email !== email) {
                    updateData.email = email;
                }
                if (Object.keys(updateData).length > 0) {
                    user = await prisma_1.default.user.update({
                        where: { id: user.id },
                        data: updateData,
                    });
                }
            }
            if (!user.isVerified) {
                user = await prisma_1.default.user.update({
                    where: { id: user.id },
                    data: {
                        isVerified: true,
                        verifyToken: null,
                        verifyTokenExpiry: null,
                    },
                });
            }
            return done(null, user);
        }
        catch (error) {
            return done(error);
        }
    }));
    passportConfigured = true;
};
exports.configurePassport = configurePassport;
