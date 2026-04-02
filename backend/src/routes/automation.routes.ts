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

/* 🔥 FUTURE READY (EDIT FLOW SUPPORT) */
router.patch("/flows/:id", async (req, res) => {
  return res.status(501).json({
    message: "Update flow not implemented yet",
  });
});

export default router;