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
exports.closeBookingMonitorWorker = exports.initBookingMonitorWorker = void 0;
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("../queues/queue.defaults");
const refreshEvents_service_1 = require("../services/crm/refreshEvents.service");
const whatsapp_service_1 = require("../services/whatsapp.service");
const aiFollowup_service_1 = require("../services/aiFollowup.service");
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const globalForBookingMonitorWorker = globalThis;
const initBookingMonitorWorker = () => {
    if (!shouldRunWorker) {
        console.log("[bookingMonitor.worker] RUN_WORKER disabled, worker not started");
        return null;
    }
    if (globalForBookingMonitorWorker.__sylphBookingMonitorWorker) {
        return globalForBookingMonitorWorker.__sylphBookingMonitorWorker;
    }
    const worker = new bullmq_1.Worker("booking-monitor", (0, queue_defaults_1.withRedisWorkerFailSafe)("booking-monitor", async () => {
        try {
            const now = new Date();
            const missedAppointments = await prisma_1.default.appointment.findMany({
                where: {
                    status: "CONFIRMED",
                    startTime: {
                        lt: new Date(now.getTime() - 10 * 60 * 1000),
                    },
                },
                include: { lead: true },
                take: 50,
            });
            for (const appointment of missedAppointments) {
                try {
                    if (appointment.status !== "CONFIRMED") {
                        continue;
                    }
                    await prisma_1.default.appointment.update({
                        where: { id: appointment.id },
                        data: { status: "MISSED" },
                    });
                    if (appointment.leadId) {
                        await (0, refreshEvents_service_1.publishCRMRefreshEvent)({
                            businessId: appointment.businessId,
                            leadId: appointment.leadId,
                            event: "booking_missed",
                        });
                    }
                    try {
                        const { setConversationState } = await Promise.resolve().then(() => __importStar(require("../services/conversationState.service")));
                        if (appointment.lead?.id) {
                            await setConversationState(appointment.lead.id, "RESCHEDULE_FLOW", {
                                context: { from: "MISSED_BOOKING" },
                            });
                        }
                    }
                    catch (error) {
                        console.error("STATE SET ERROR:", error);
                    }
                    let finalPhone = null;
                    if (appointment.lead?.phone) {
                        const raw = appointment.lead.phone.replace(/\D/g, "");
                        finalPhone = raw.startsWith("91") ? raw : `91${raw}`;
                    }
                    if (finalPhone) {
                        await (0, whatsapp_service_1.sendWhatsAppMessage)({
                            to: finalPhone,
                            message: "We missed you today.\n\nWould you like to reschedule your appointment?",
                        });
                    }
                    if (appointment.lead?.id) {
                        (0, aiFollowup_service_1.sendAIFollowup)(appointment.lead.id).catch((error) => {
                            console.error("AI FOLLOWUP ERROR:", error);
                        });
                    }
                    prisma_1.default.analytics
                        .create({
                        data: {
                            businessId: appointment.businessId,
                            type: "BOOKING_MISSED",
                            meta: {
                                appointmentId: appointment.id,
                                leadId: appointment.leadId,
                                time: new Date(),
                            },
                        },
                    })
                        .catch(() => undefined);
                }
                catch (error) {
                    console.error("ERROR PROCESSING APPOINTMENT:", appointment.id, error);
                }
            }
        }
        catch (error) {
            console.error("BOOKING MONITOR ERROR:", error);
        }
    }), {
        connection: (0, redis_1.getWorkerRedisConnection)(),
        concurrency: 1,
    });
    globalForBookingMonitorWorker.__sylphBookingMonitorWorker = worker;
    return worker;
};
exports.initBookingMonitorWorker = initBookingMonitorWorker;
const closeBookingMonitorWorker = async () => {
    await globalForBookingMonitorWorker.__sylphBookingMonitorWorker
        ?.close()
        .catch(() => undefined);
    globalForBookingMonitorWorker.__sylphBookingMonitorWorker = undefined;
};
exports.closeBookingMonitorWorker = closeBookingMonitorWorker;
