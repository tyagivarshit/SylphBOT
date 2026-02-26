console.log("CLIENT ROUTES FILE LOADED");
import { Router } from "express";
import {
  createClient,
  getClients,
  getSingleClient,
  updateClient,
  deleteClient,
} from "../controllers/client.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/", protect, createClient);
router.get("/", protect, getClients);
router.get("/:id", protect, getSingleClient); // 👈 YE ADD KARO
router.put("/:id", protect, updateClient);
router.delete("/:id", protect, deleteClient);

export default router;