"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOwnerWhatsAppNotification = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
/* ===================================================== */
const sendOwnerWhatsAppNotification = async (data) => {
    const { businessId, leadId, slot, type } = data;
    try {
        console.log("📤 Sending owner WhatsApp notification...");
        /* =====================================================
        FETCH BUSINESS
        ===================================================== */
        const business = await prisma_1.default.business.findUnique({
            where: { id: businessId },
            include: {
                owner: true,
                clients: true,
            },
        });
        if (!business) {
            console.log("❌ No business found");
            return;
        }
        const ownerPhone = business.owner?.phone;
        const whatsappClient = business.clients.find((c) => c.platform === "WHATSAPP");
        if (!ownerPhone || !whatsappClient) {
            console.log("❌ Missing owner phone or WhatsApp client");
            return;
        }
        /* =====================================================
        FORMAT PHONE
        ===================================================== */
        const formattedPhone = ownerPhone.replace(/\D/g, "");
        const finalPhone = formattedPhone.startsWith("91")
            ? formattedPhone
            : `91${formattedPhone}`;
        /* =====================================================
        TOKEN
        ===================================================== */
        const accessToken = (0, encrypt_1.decrypt)(whatsappClient.accessToken);
        /* =====================================================
        LEAD DATA
        ===================================================== */
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                id: leadId,
                businessId,
            },
        });
        /* =====================================================
        🧠 MESSAGE BASED ON TYPE
        ===================================================== */
        let messageText = "";
        if (type === "CONFIRMED") {
            messageText = `📅 New Booking!\n\n👤 ${lead?.name || "Customer"}\n📞 ${lead?.phone || "N/A"}\n🕒 ${slot?.toLocaleString()}`;
        }
        else if (type === "CANCELLED") {
            messageText = `❌ Booking Cancelled\n\n👤 ${lead?.name || "Customer"}\n📞 ${lead?.phone || "N/A"}`;
        }
        else if (type === "RESCHEDULED") {
            messageText = `🔁 Booking Rescheduled\n\n👤 ${lead?.name || "Customer"}\n📞 ${lead?.phone || "N/A"}\n🕒 ${slot?.toLocaleString() || "Updated time"}`;
        }
        else {
            messageText = `📩 Booking Update\n\n👤 ${lead?.name || "Customer"}`;
        }
        /* =====================================================
        TEMPLATE BODY PARAMS (SAFE)
        ===================================================== */
        const bodyParams = [
            lead?.name || "Customer",
            lead?.phone || "N/A",
            slot ? slot.toLocaleString() : "-",
        ];
        const templatePayload = {
            messaging_product: "whatsapp",
            to: finalPhone,
            type: "template",
            template: {
                name: "booking_notification",
                language: { code: "en" },
                components: [
                    {
                        type: "body",
                        parameters: bodyParams.map((text) => ({
                            type: "text",
                            text,
                        })),
                    },
                ],
            },
        };
        let res;
        /* =====================================================
        TRY TEMPLATE
        ===================================================== */
        try {
            res = await axios_1.default.post(`https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`, templatePayload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            });
            console.log("✅ WhatsApp TEMPLATE sent:", res.data);
        }
        catch (err) {
            console.error("⚠️ Template failed, sending fallback");
            if (err.response) {
                console.error("📛 META TEMPLATE ERROR:", err.response.data);
            }
            /* =====================================================
            FALLBACK TEXT MESSAGE
            ===================================================== */
            res = await axios_1.default.post(`https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`, {
                messaging_product: "whatsapp",
                to: finalPhone,
                type: "text",
                text: {
                    body: messageText,
                },
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                timeout: 10000,
            });
            console.log("✅ WhatsApp FALLBACK sent:", res.data);
        }
    }
    catch (error) {
        console.error("❌ OWNER NOTIFY ERROR");
        if (error.response) {
            console.error("📛 META ERROR:", error.response.data);
        }
        else {
            console.error(error.message);
        }
    }
};
exports.sendOwnerWhatsAppNotification = sendOwnerWhatsAppNotification;
