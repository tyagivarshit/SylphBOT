import { Router } from "express";
import { HelpAiController } from "../controllers/helpAi.controller";

const router = Router();

router.post("/", HelpAiController.reply);

export default router;
