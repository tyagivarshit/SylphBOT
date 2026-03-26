import express from "express";
import { protect } from "../middleware/auth.middleware";
import { getIntegrations } from "../controllers/integration.controller";

const router = express.Router();

router.get("/", protect, getIntegrations);

export default router;