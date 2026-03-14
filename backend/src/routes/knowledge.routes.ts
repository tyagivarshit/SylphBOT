import { Router } from "express";
import {
  createKnowledge,
  getKnowledge,
  deleteKnowledge
} from "../controllers/knowledge.controller";

import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, createKnowledge);

router.get("/", protect, getKnowledge);

router.delete("/:id", protect, deleteKnowledge);

export default router;