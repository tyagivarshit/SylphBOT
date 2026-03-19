import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { toggleHumanControl } from "../controllers/lead.controller";

const router = Router();

router.post("/toggle-human", protect, toggleHumanControl);

export default router;