"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingMonitorWorker = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const whatsapp_service_1 = require("../services/whatsapp.service");
const aiFollowup_service_1 = require("../services/aiFollowup.service");
/*
=========================================================
MISSED BOOKING MONITOR (PRODUCTION SAFE)
=========================================================
*/
exports.bookingMonitorWorker = new bullmq_1.Worker("booking-monitor", async () => {
    try {
        const now = new Date();
        console.log("🧠 Running booking monitor...");
        /* =================================================
        🔥 LIMIT QUERY (SCALABLE)
        ================================================= */
        const missedAppointments = await prisma_1.default.appointment.findMany({
            where: {
                status: "BOOKED",
                startTime: {
                    lt: new Date(now.getTime() - 10 * 60 * 1000),
                },
            },
            include: { lead: true },
            take: 50, // 🔥 IMPORTANT (batch processing)
        });
        for (const appt of missedAppointments) {
            try {
                /* =================================================
                🔒 DOUBLE CHECK (ANTI DUPLICATE)
                ================================================= */
                if (appt.status !== "BOOKED")
                    continue;
                /* =================================================
                🔥 MARK MISSED
                ================================================= */
                await prisma_1.default.appointment.update({
                    where: { id: appt.id },
                    data: { status: "MISSED" },
                });
                /* =================================================
      🧠 SET RESCHEDULE STATE (NEW)
      ================================================= */
                try {
                    const { setConversationState } = await Promise.resolve().then(() => __importStar(require("../services/conversationState.service")));
                    if (appt.lead?.id) {
                        await setConversationState(appt.lead.id, "RESCHEDULE_FLOW", {
                            context: { from: "MISSED_BOOKING" },
                        });
                        console.log("🧠 RESCHEDULE STATE SET:", appt.lead.id);
                    }
                    console.log("🧠 RESCHEDULE STATE SET:", appt.leadId);
                }
                catch (err) {
                    console.error("❌ STATE SET ERROR:", err);
                }
                console.log("⚠️ Marked MISSED:", appt.id);
                /* =================================================
                📞 FORMAT PHONE
                ================================================= */
                let finalPhone = null;
                if (appt.lead?.phone) {
                    const raw = appt.lead.phone.replace(/\D/g, "");
                    finalPhone = raw.startsWith("91") ? raw : `91${raw}`;
                }
                /* =================================================
                📲 SEND WHATSAPP
                ================================================= */
                if (finalPhone) {
                    await (0, whatsapp_service_1.sendWhatsAppMessage)({
                        to: finalPhone,
                        message: `😔 We missed you today.

Would you like to reschedule your appointment?

Reply YES and we’ll set it up again 👍`,
                    });
                }
                /* =================================================
                🤖 AI FOLLOWUP (NON BLOCKING)
                ================================================= */
                if (appt.lead?.id) {
                    (0, aiFollowup_service_1.sendAIFollowup)(appt.lead.id).catch((err) => {
                        console.error("❌ AI FOLLOWUP ERROR:", err);
                    });
                }
                /* =================================================
                📊 ANALYTICS (SAFE)
                ================================================= */
                prisma_1.default.analytics.create({
                    data: {
                        businessId: appt.businessId,
                        type: "BOOKING_MISSED",
                        meta: {
                            appointmentId: appt.id,
                            leadId: appt.leadId,
                            time: new Date(),
                        },
                    },
                }).catch(() => { });
            }
            catch (err) {
                console.error("❌ ERROR PROCESSING APPT:", appt.id, err);
            }
        }
    }
    catch (error) {
        console.error("❌ BOOKING MONITOR ERROR:", error);
    }
}, {
    connection: redis_1.redisConnection,
    concurrency: 1, // 🔥 IMPORTANT (avoid race condition)
});
