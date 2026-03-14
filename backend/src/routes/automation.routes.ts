import { Router } from "express";
import {
  createAutomationFlow,
  getFlows,
} from "../controllers/automation.controller";

const router = Router();

router.post("/flows", createAutomationFlow);

router.get("/flows", getFlows);

export default router;