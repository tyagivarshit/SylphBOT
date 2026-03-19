import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { 
  saveBusinessInfo, 
  saveFAQ, 
  saveAISettings 
} from "../controllers/training.controller";

const router = Router();

/* ================= AI TRAINING ================= */

router.post("/business", protect, saveBusinessInfo);
router.post("/faq", protect, saveFAQ);
router.post("/settings", protect, saveAISettings);

export default router;