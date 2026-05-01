import { Router } from "express";
import {
  createClient,
  getClients,
  getSingleClient,
  updateClient,
  deleteClient,
  metaOAuthConnect,
  updateAITraining,
  startMetaOAuth,
} from "../controllers/client.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, createClient);
router.get("/", protect, getClients);

router.get("/oauth/meta", protect, startMetaOAuth);
router.post("/oauth/meta", protect, metaOAuthConnect);

router.get("/:id", protect, getSingleClient);
router.put("/:id", protect, updateClient);
router.delete("/:id", protect, deleteClient);

router.put("/ai-training/:id", protect, updateAITraining);

export default router;
