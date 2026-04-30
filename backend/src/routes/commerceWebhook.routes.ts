import { Router } from "express";
import { commerceWebhook } from "../controllers/commerceWebhook.controller";

const router = Router();

router.post("/:provider", commerceWebhook);

export default router;
