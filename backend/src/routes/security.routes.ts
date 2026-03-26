import express from "express";
import { protect } from "../middleware/auth.middleware";
import {
  getSessions,
  logoutAllSessions,
} from "../controllers/security.controller";

const router = express.Router();

router.get("/sessions", protect, getSessions);
router.delete("/sessions", protect, logoutAllSessions);

export default router;