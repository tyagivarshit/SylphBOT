"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const knowledge_controller_1 = require("../controllers/knowledge.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/* =====================================================
CREATE
POST /api/knowledge
===================================================== */
router.post("/", auth_middleware_1.protect, knowledge_controller_1.createKnowledge);
/* =====================================================
GET ALL
GET /api/knowledge
===================================================== */
router.get("/", auth_middleware_1.protect, knowledge_controller_1.getKnowledge);
/* =====================================================
GET SINGLE (🔥 NEW)
GET /api/knowledge/:id
===================================================== */
router.get("/:id", auth_middleware_1.protect, knowledge_controller_1.getSingleKnowledge);
/* =====================================================
UPDATE
PUT /api/knowledge/:id
===================================================== */
router.put("/:id", auth_middleware_1.protect, knowledge_controller_1.updateKnowledge);
/* =====================================================
DELETE
DELETE /api/knowledge/:id
===================================================== */
router.delete("/:id", auth_middleware_1.protect, knowledge_controller_1.deleteKnowledge);
exports.default = router;
