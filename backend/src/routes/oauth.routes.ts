import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

/*
---------------------------------------------------
META OAUTH CALLBACK
---------------------------------------------------
*/

router.get("/meta/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Invalid OAuth request");
    }

    const userId = state as string;

    /*
    🔥 CALL YOUR EXISTING CONTROLLER
    (metaOAuthConnect ko reuse karenge)
    */

    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/clients/oauth/meta`,
      {
        code,
      },
      {
        headers: {
          Cookie: req.headers.cookie || "", // 🔥 session pass karne ke liye
        },
      }
    );

    /*
    🔥 SUCCESS → FRONTEND REDIRECT
    */

    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?integration=success&onboarding=1`
    );

  } catch (error) {
    console.error("OAuth callback error:", error);

    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?integration=error`
    );
  }
});

export default router;
