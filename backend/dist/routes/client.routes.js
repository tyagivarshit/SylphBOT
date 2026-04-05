"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log("CLIENT ROUTES FILE LOADED");
const express_1 = require("express");
const client_controller_1 = require("../controllers/client.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/* =========================
   🔥 BASIC CLIENT ROUTES
========================= */
router.post("/", auth_middleware_1.protect, client_controller_1.createClient);
router.get("/", auth_middleware_1.protect, client_controller_1.getClients);
/* =========================
   🔥 OAUTH START (VERY IMPORTANT)
   MUST BE ABOVE :id
========================= */
router.get("/oauth/meta", auth_middleware_1.protect, client_controller_1.startMetaOAuth);
/* =========================
   🔥 CLIENT CRUD
========================= */
router.get("/:id", auth_middleware_1.protect, client_controller_1.getSingleClient);
router.put("/:id", auth_middleware_1.protect, client_controller_1.updateClient);
router.delete("/:id", auth_middleware_1.protect, client_controller_1.deleteClient);
/* =========================
   🔥 OAUTH FINISH
========================= */
router.post("/oauth/meta", auth_middleware_1.protect, client_controller_1.metaOAuthConnect);
/* =========================
   🔥 AI TRAINING
========================= */
router.put("/ai-training/:id", auth_middleware_1.protect, client_controller_1.updateAITraining);
exports.default = router;
