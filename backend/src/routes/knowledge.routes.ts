import { Router } from "express";
import {
  createKnowledge,
  getKnowledge,
  getSingleKnowledge, // 🔥 ADD THIS
  deleteKnowledge,
  updateKnowledge
} from "../controllers/knowledge.controller";

import { protect } from "../middleware/auth.middleware";

const router = Router();

/* =====================================================
CREATE
POST /api/knowledge
===================================================== */
router.post("/", protect, createKnowledge);

/* =====================================================
GET ALL
GET /api/knowledge
===================================================== */
router.get("/", protect, getKnowledge);

/* =====================================================
GET SINGLE (🔥 NEW)
GET /api/knowledge/:id
===================================================== */
router.get("/:id", protect, getSingleKnowledge);

/* =====================================================
UPDATE
PUT /api/knowledge/:id
===================================================== */
router.put("/:id", protect, updateKnowledge);

/* =====================================================
DELETE
DELETE /api/knowledge/:id
===================================================== */
router.delete("/:id", protect, deleteKnowledge);

export default router;