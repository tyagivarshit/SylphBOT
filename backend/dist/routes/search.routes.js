"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("../config/prisma"));
const router = express_1.default.Router();
router.get("/", async (req, res) => {
    try {
        const q = req.query.q?.toLowerCase()?.trim();
        if (!q)
            return res.json([]);
        /* =========================
        🔥 NAVIGATION (MATCHES YOUR APP)
        ========================= */
        const navigation = [
            { id: "nav-dashboard", title: "Dashboard", url: "/dashboard", type: "page" },
            { id: "nav-leads", title: "Leads", url: "/leads", type: "page" },
            { id: "nav-conversations", title: "Conversations", url: "/conversations", type: "page" },
            { id: "nav-automation", title: "Automation", url: "/automation", type: "page" },
            { id: "nav-analytics", title: "Analytics", url: "/analytics", type: "page" },
            { id: "nav-settings", title: "Settings", url: "/settings", type: "page" },
            { id: "nav-ai-training", title: "AI Training", url: "/ai-training", type: "page" },
            { id: "nav-ai-settings", title: "AI Settings", url: "/ai-settings", type: "page" },
            { id: "nav-billing", title: "Billing", url: "/billing", type: "page" },
            { id: "nav-booking", title: "Booking", url: "/booking", type: "page" },
            { id: "nav-calendar", title: "Booking Calendar", url: "/booking-calendar", type: "page" },
            { id: "nav-clients", title: "Clients", url: "/clients", type: "page" },
            { id: "nav-comments", title: "Comment Automation", url: "/comment-automation", type: "page" },
            { id: "nav-knowledge", title: "Knowledge Base", url: "/knowledge-base", type: "page" },
        ].filter((item) => item.title.toLowerCase().includes(q));
        /* =========================
        🔥 LEADS (DYNAMIC)
        ========================= */
        const leads = await prisma_1.default.lead.findMany({
            where: {
                OR: [
                    { name: { contains: q } },
                    { email: { contains: q } },
                    { phone: { contains: q } },
                ],
            },
            take: 5,
            orderBy: { createdAt: "desc" },
        });
        const leadResults = leads.map((l) => ({
            id: `lead-${l.id}`,
            title: l.name || l.email || l.phone || "Lead",
            subtitle: "Lead",
            url: `/leads/${l.id}`, // ✅ FIXED
            type: "lead",
        }));
        /* =========================
        🔥 MESSAGES / CONVERSATIONS
        ========================= */
        const messages = await prisma_1.default.message.findMany({
            where: {
                content: { contains: q },
            },
            take: 5,
            orderBy: { createdAt: "desc" },
        });
        const messageResults = messages.map((m) => ({
            id: `msg-${m.id}`,
            title: m.content.slice(0, 50),
            subtitle: "Message",
            url: `/conversations/${m.leadId}`, // ✅ FIXED
            type: "message",
        }));
        /* =========================
        🔥 FINAL MERGE
        ========================= */
        const results = [
            ...navigation,
            ...leadResults,
            ...messageResults,
        ];
        res.json(results);
    }
    catch (err) {
        console.error("SEARCH ERROR:", err);
        res.status(500).json([]);
    }
});
exports.default = router;
