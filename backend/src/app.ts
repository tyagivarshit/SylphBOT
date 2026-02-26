
import express from "express";
import cors from "cors";
import prisma from "./config/prisma";
import authRoutes from "./routes/auth.routes";
import { protect } from "./middleware/auth.middleware";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook"
import instagramWebhook from "./routes/instagram.webhook";


const app = express();

app.get("/", (req, res) => {
  console.log("ROOT HIT");
  res.send("ROOT WORKING");
});
// Middlewares
app.use(cors());
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/webhook/whatsapp", whatsappWebhook);
app.use("/api/webhook/instagram", instagramWebhook);


// Health Route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running 🚀"
  });
});
app.get("/db-test", async (req, res) => {
  try {
    await prisma.$connect();
    res.json({ success: true, message: "DB Connected Successfully ✅" });
  } catch (error) {
    res.status(500).json({ success: false, error });
  }
});
app.get("/protected", protect, (req, res) => {
  res.json({ message: "Protected route accessed" });
});

export default app;