import { Router } from "express";
import { register, login } from "../controllers/auth.controller";
import { refreshAccessToken } from "../controllers/token.controller";
import { verifyEmail } from "../controllers/auth.controller";


const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshAccessToken);
router.get("/verify-email", verifyEmail);

export default router;