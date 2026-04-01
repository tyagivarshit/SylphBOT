import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { 
  saveBusinessInfo, 
  saveFAQ, 
  saveAISettings,
  getBusinessInfo,
  getFAQs,
  getAISettings
} from "../controllers/training.controller";

const router = Router();

/* ================= AI TRAINING ================= */

// 🔥 POST (SAVE)
router.post("/business", protect, saveBusinessInfo);
router.post("/faq", protect, saveFAQ);
router.post("/settings", protect, saveAISettings);

// 🔥 GET (LOAD) ✅ ADD THIS
router.get("/business", protect, getBusinessInfo);
router.get("/faq", protect, getFAQs);
router.get("/settings", protect, getAISettings);

export default router;