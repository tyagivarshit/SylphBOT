console.log("CLIENT ROUTES FILE LOADED");
import { Router } from "express";
import {
  createClient,
  getClients,
  getSingleClient,
  updateClient,
  deleteClient,
  metaOAuthConnect, // 🟢 NEW
} from "../controllers/client.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, createClient);
router.get("/", protect, getClients);
router.get("/:id", protect, getSingleClient);
router.put("/:id", protect, updateClient);
router.delete("/:id", protect, deleteClient);

/* 🟢 NEW ROUTE FOR INSTAGRAM OAUTH */
router.post("/oauth/meta", protect, metaOAuthConnect);

export default router;