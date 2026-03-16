import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import prisma from "./prisma"
import crypto from "crypto"

export const configurePassport = () => {

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: "/api/auth/google/callback",
        scope: ["profile","email"]
      },

      async (accessToken, refreshToken, profile, done) => {

        try {

          const email = profile.emails?.[0]?.value

          if (!email) {
            return done(new Error("Google account has no email"))
          }

          let user = await prisma.user.findUnique({
            where: { email }
          })

          /* CREATE USER IF NOT EXISTS */

          if (!user) {

            user = await prisma.user.create({
              data:{
                email: email,
                name: profile.displayName,
                password: crypto.randomBytes(32).toString("hex"),
                isVerified: true
              }
            })

          }

          return done(null, user)

        } catch(error) {

          return done(error as Error)

        }

      }
    )
  )

}