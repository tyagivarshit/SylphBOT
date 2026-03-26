console.log("CLIENT ROUTES FILE LOADED");

import { Router } from "express";
import {
  createClient,
  getClients,
  getSingleClient,
  updateClient,
  deleteClient,
  metaOAuthConnect,
  updateAITraining,
  startMetaOAuth, // 🔥 ADD THIS
} from "../controllers/client.controller";

import { protect } from "../middleware/auth.middleware";

const router = Router();

/* =========================
   🔥 BASIC CLIENT ROUTES
========================= */

router.post("/", protect, createClient);
router.get("/", protect, getClients);

/* =========================
   🔥 OAUTH START (VERY IMPORTANT)
   MUST BE ABOVE :id
========================= */
router.get("/oauth/meta", protect, startMetaOAuth);

/* =========================
   🔥 CLIENT CRUD
========================= */
router.get("/:id", protect, getSingleClient);
router.put("/:id", protect, updateClient);
router.delete("/:id", protect, deleteClient);

/* =========================
   🔥 OAUTH FINISH
========================= */
router.post("/oauth/meta", protect, metaOAuthConnect);

/* =========================
   🔥 AI TRAINING
========================= */
router.put("/ai-training/:id", protect, updateAITraining);

export default router;