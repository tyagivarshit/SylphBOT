import express from "express";
import prisma from "../config/prisma";
import upload from "../middleware/upload";
import cloudinary from "../config/cloudinary";
import { protect } from "../middleware/auth.middleware";

const router = express.Router();

/* =========================
   🔥 GET CURRENT USER (PROTECTED)
========================= */
router.get("/me", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.setHeader("Cache-Control", "no-store");

    return res.json(user);
  } catch (err) {
    console.error("GET USER ERROR:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/* =========================
   🔥 UPDATE USER + BUSINESS (PROTECTED)
========================= */
router.patch("/update", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      name,
      phone,
      business,
      website,
      industry,
      teamSize,
      type,
      timezone,
    } = req.body;

    /* 🔹 UPDATE USER */
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
      },
    });

    /* 🔹 GET BUSINESS ID */
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    /* 🔹 UPDATE BUSINESS */
    if (userData?.businessId) {
      await prisma.business.update({
        where: { id: userData.businessId },
        data: {
          ...(business && { name: business }),
          ...(website !== undefined && { website }),
          ...(industry !== undefined && { industry }),
          ...(teamSize !== undefined && { teamSize }),
          ...(type !== undefined && { type }),
          ...(timezone !== undefined && { timezone }),
        },
      });
    }

    /* 🔥 RETURN UPDATED USER */
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: true,
      },
    });

    return res.json(updatedUser);

  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* =========================
   🔥 UPLOAD AVATAR (PROTECTED)
========================= */
router.post(
  "/upload-avatar",
  protect,
  upload.single("file"),
  async (req: any, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      /* 🔥 CHECK USER */
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      /* 🔥 CLOUDINARY UPLOAD */
      const result: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "avatars",
              transformation: [{ width: 300, height: 300, crop: "fill" }],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          )
          .end(req.file.buffer);
      });

      const imageUrl = result.secure_url;

      /* 🔥 SAVE IN DB */
      await prisma.user.update({
        where: { id: userId },
        data: {
          avatar: imageUrl,
        },
      });

      /* 🔥 RETURN UPDATED USER */
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          business: true,
        },
      });

      return res.json(updatedUser);

    } catch (err) {
      console.error("UPLOAD AVATAR ERROR:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;