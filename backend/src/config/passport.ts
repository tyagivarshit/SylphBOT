import crypto from "crypto";
import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma";
import { env } from "./env";

const GOOGLE_CALLBACK_URL =
  env.BACKEND_URL
    ? `${env.BACKEND_URL}/api/auth/google/callback`
    : "http://localhost:5000/api/auth/google/callback";

let passportConfigured = false;

export const configurePassport = () => {
  if (passportConfigured) {
    return;
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing"
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.trim().toLowerCase();
          const displayName =
            String(profile.displayName || "").trim() ||
            String(profile.name?.givenName || "").trim() ||
            email?.split("@")[0] ||
            "Workspace Owner";
          const avatarUrl =
            String(profile.photos?.[0]?.value || "").trim() || null;

          if (!email) {
            return done(new Error("Google account has no email"));
          }

          let user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user) {
            const randomPassword = crypto.randomBytes(32).toString("hex");
            user = await prisma.user.create({
              data: {
                email,
                name: displayName,
                password: await bcrypt.hash(randomPassword, 12),
                isVerified: true,
                avatar: avatarUrl,
              },
            });
          } else {
            const updateData: Record<string, unknown> = {};

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
              user = await prisma.user.update({
                where: { id: user.id },
                data: updateData,
              });
            }
          }

          if (!user.isVerified) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                isVerified: true,
                verifyToken: null,
                verifyTokenExpiry: null,
              },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passportConfigured = true;
};
