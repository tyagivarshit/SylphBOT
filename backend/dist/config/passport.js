"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePassport = void 0;
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const prisma_1 = __importDefault(require("./prisma"));
const crypto_1 = __importDefault(require("crypto"));
const configurePassport = () => {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
        scope: ["profile", "email"]
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
                return done(new Error("Google account has no email"));
            }
            let user = await prisma_1.default.user.findUnique({
                where: { email }
            });
            /* CREATE USER IF NOT EXISTS */
            if (!user) {
                user = await prisma_1.default.user.create({
                    data: {
                        email: email,
                        name: profile.displayName,
                        password: crypto_1.default.randomBytes(32).toString("hex"),
                        isVerified: true
                    }
                });
            }
            return done(null, user);
        }
        catch (error) {
            return done(error);
        }
    }));
};
exports.configurePassport = configurePassport;
