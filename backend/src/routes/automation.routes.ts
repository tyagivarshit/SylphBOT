import { Router } from "express";
import {
  createAutomationFlow,
  getFlows,
} from "../controllers/automation.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ---------------- AUTH ---------------- */

router.use(protect);

/* ---------------- ROUTES ---------------- */

router.post("/flows", createAutomationFlow);

router.get("/flows", getFlows);

export default router;