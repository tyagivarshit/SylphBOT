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

export const configurePassport = () => {
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
                name: profile.displayName,
                password: await bcrypt.hash(randomPassword, 12),
                isVerified: true,
              },
            });
          } else if (!user.isVerified) {
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
};
