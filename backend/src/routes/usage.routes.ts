import { Router } from "express";
import { UsageController } from "../controllers/usage.controller";

const router = Router();

router.get("/", UsageController.getUsage);

export default router;
