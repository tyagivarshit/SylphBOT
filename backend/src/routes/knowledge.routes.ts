import { Router } from "express";
import {
  createKnowledge,
  getKnowledge,
  deleteKnowledge,
  updateKnowledge
} from "../controllers/knowledge.controller";

import { protect } from "../middleware/auth.middleware";

const router = Router();

/* CREATE */
router.post("/", protect, createKnowledge);

/* GET ALL */
router.get("/", protect, getKnowledge);

/* UPDATE (FIX ADDED 🔥) */
router.put("/:id", protect, updateKnowledge);

/* DELETE */
router.delete("/:id", protect, deleteKnowledge);

export default router;