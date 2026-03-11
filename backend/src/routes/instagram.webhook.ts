import { Router, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";
import { generateAIFunnelReply } from "../services/aiFunnel.service";
import { routeAIMessage } from "../services/aiRouter.service";
import { scheduleFollowups, cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { handleCommentAutomation } from "../services/commentAutomation.service";

const router = Router();

/* --------------------------------------------------- */
const log = (...args: any[]) => {
console.log("[INSTAGRAM WEBHOOK]", ...args);
};
/* --------------------------------------------------- */

/* SIGNATURE VERIFY */

const verifySignature = (req: any): boolean => {
try {
const signature = req.headers["x-hub-signature-256"] as string;
const appSecret = process.env.META_APP_SECRET;

if (!signature || !appSecret) return false;

const expected =
"sha256=" +
crypto
.createHmac("sha256", appSecret)
.update(req.body)
.digest("hex");

return signature === expected;

} catch {
return false;
}
};

/* ---------------------------------------------------
WEBHOOK VERIFY
--------------------------------------------------- */

router.get("/", (req: Request, res: Response) => {

const mode = req.query["hub.mode"];
const token = req.query["hub.verify_token"];
const challenge = req.query["hub.challenge"];

if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
log("Webhook verified");
return res.status(200).send(challenge);
}

log("Webhook verification failed");
return res.sendStatus(403);

});

/* ---------------------------------------------------
INSTAGRAM WEBHOOK
--------------------------------------------------- */

router.post("/", async (req: any, res: Response) => {

console.log("🔥 INSTAGRAM WEBHOOK HIT");

let body: any;

try {

body =
Buffer.isBuffer(req.body)
? JSON.parse(req.body.toString("utf8"))
: req.body;

} catch (err) {

log("Body parse failed");
return res.sendStatus(400);

}

console.log("📩 BODY:", JSON.stringify(body, null, 2));

try {

if (process.env.NODE_ENV === "production" && !verifySignature(req)) {
log("Invalid signature");
return res.sendStatus(403);
}

/* ---------------------------------------------------
COMMENT AUTOMATION
--------------------------------------------------- */

const change = body.entry?.[0]?.changes?.[0];

if (change?.value?.item === "comment") {

const commentText = change.value.comment?.text;
const instagramUserId = change.value.from?.id;
const reelId = change.value.media?.id;
const pageId = change.value.id;

if (!commentText || !instagramUserId || !reelId) {
return res.sendStatus(200);
}

log("Comment detected:", commentText);

const client = await prisma.client.findFirst({
where: {
platform: "INSTAGRAM",
pageId: pageId,
isActive: true,
},
});

if (!client) {
log("Client not found for comment automation");
return res.sendStatus(200);
}

await handleCommentAutomation({
businessId: client.businessId,
clientId: client.id,
instagramUserId,
reelId,
commentText,
});

return res.sendStatus(200);
}

/* ---------------------------------------------------
DM MESSAGE HANDLER
--------------------------------------------------- */

const entry = body.entry?.[0];
const messaging = entry?.messaging?.[0];

if (!entry || !messaging) {
return res.sendStatus(200);
}

if (!messaging.message) {
log("Non-message event ignored");
return res.sendStatus(200);
}

const senderId = String(messaging.sender?.id);
const pageId = String(entry.id);
const text = messaging.message?.text;

if (!senderId || !text) {
return res.sendStatus(200);
}

if (senderId === pageId) {
log("Echo message ignored");
return res.sendStatus(200);
}

log("Incoming message:", text);

/* ---------- CLIENT ---------- */

const client = await prisma.client.findFirst({
where: {
platform: "INSTAGRAM",
pageId: pageId,
isActive: true,
},
});

if (!client) {
log("Client not found:", pageId);
return res.sendStatus(200);
}

/* ---------- LEAD ---------- */

let lead = await prisma.lead.findFirst({
where: {
businessId: client.businessId,
instagramId: senderId,
},
});

if (!lead) {

lead = await prisma.lead.create({
data: {
businessId: client.businessId,
clientId: client.id,
instagramId: senderId,
platform: "INSTAGRAM",
stage: "NEW",
},
});

log("Lead created:", lead.id);

}

const io = getIO();

/* ---------- PLAN CHECK ---------- */

const subscription = await prisma.subscription.findUnique({
where: { businessId: client.businessId },
include: { plan: true },
});

/* ---------- AI ROUTER ---------- */

let aiReply: string | null = null;

try {

aiReply = await routeAIMessage({
businessId: client.businessId,
leadId: lead.id,
message: text,
});

} catch (err) {

log("AI router failed, fallback triggered:", err);

try {

if (
  subscription?.plan.name === "PRO" ||
  subscription?.plan.name === "ENTERPRISE"
) {

  aiReply = await generateAIFunnelReply({
    businessId: client.businessId,
    leadId: lead.id,
    message: text,
  });

} else {

  aiReply = await generateAIReply({
    businessId: client.businessId,
    leadId: lead.id,
    message: text,
  });

}

} catch (fallbackError) {

log("AI fallback failed:", fallbackError);

}

}

log("AI reply generated:", aiReply);

if (!aiReply) {
aiReply = "Thanks for your message! We'll reply shortly.";
}

/* ---------- SOCKET EMIT ---------- */

io.to(`lead_${lead.id}`).emit("new_message", {
sender: "USER",
content: text
});

io.to(`lead_${lead.id}`).emit("new_message", {
sender: "AI",
content: aiReply
});

/* ---------- LEAD UPDATE ---------- */

await prisma.lead.update({
where: { id: lead.id },
data: {
lastMessageAt: new Date(),
followupCount: 0,
unreadCount: { increment: 1 }
},
});

await cancelFollowups(lead.id);
await scheduleFollowups(lead.id);

/* ---------- SEND MESSAGE ---------- */

const accessToken = decrypt(client.accessToken);

try {

await axios.post(
"https://graph.facebook.com/v19.0/me/messages",
{
recipient: { id: senderId },
message: { text: aiReply },
},
{
headers: {
Authorization: `Bearer ${accessToken}`,
"Content-Type": "application/json",
},
}
);

log("Message sent to Instagram");

} catch (err: any) {

log("Instagram send error:", err.response?.data || err.message);

}

return res.sendStatus(200);

} catch (error) {

log("Webhook error:", error);
return res.sendStatus(500);

}

});

export default router;
