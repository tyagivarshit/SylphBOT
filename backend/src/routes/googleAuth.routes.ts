import { Router } from "express"
import passport from "passport"
import {
  googleAuth,
  googleCallback
} from "../controllers/googleAuth.controller"

const router = Router()

/* GOOGLE LOGIN */

router.get(
  "/google",
  googleAuth
)

/* GOOGLE CALLBACK */

router.get(
  "/google/callback",
  passport.authenticate("google", { session:false }),
  googleCallback
)

export default router