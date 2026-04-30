"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayCalendarSyncWebhookController = exports.upsertMeetingArtifactsController = exports.recordAppointmentOutcomeController = exports.getAppointmentOpsProjectionController = exports.addWaitlistRequestController = exports.runningLateController = exports.checkInAppointmentController = exports.cancelCanonicalAppointmentController = exports.rescheduleCanonicalAppointmentController = exports.confirmAppointmentSlotController = exports.holdAppointmentSlotController = exports.requestAppointmentController = exports.listAppointments = exports.cancelAppointment = exports.rescheduleAppointmentController = exports.createAppointment = exports.getAvailableSlots = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const booking_service_1 = require("../services/booking.service");
const appointmentEngine_service_1 = require("../services/appointmentEngine.service");
const meetingState_service_1 = require("../services/meetingState.service");
const rescheduleEngine_service_1 = require("../services/rescheduleEngine.service");
const waitlistEngine_service_1 = require("../services/waitlistEngine.service");
const appointmentProjection_service_1 = require("../services/appointmentProjection.service");
const appointmentOutcome_service_1 = require("../services/appointmentOutcome.service");
const meetingArtifact_service_1 = require("../services/meetingArtifact.service");
const calendarSync_queue_1 = require("../queues/calendarSync.queue");
const meetingState = (0, meetingState_service_1.createMeetingStateService)();
const parseDate = (input) => {
    const parsed = new Date(String(input || ""));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getAvailableSlots = async (req, res) => {
    try {
        const requestedBusinessId = req.params.businessId;
        const businessId = req.user?.businessId || null;
        const date = req.query.date;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!requestedBusinessId || !date) {
            return res.status(400).json({
                success: false,
                message: "Business ID and date are required",
            });
        }
        if (requestedBusinessId !== businessId) {
            return res.status(403).json({
                success: false,
                message: "Forbidden",
            });
        }
        const parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }
        const slots = await (0, booking_service_1.fetchAvailableSlots)(businessId, parsedDate);
        return res.status(200).json({
            success: true,
            data: {
                slots,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch slots",
        });
    }
};
exports.getAvailableSlots = getAvailableSlots;
const createAppointment = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const { leadId, name, email, phone, startTime, endTime } = req.body;
        if (!businessId || !startTime || !endTime || !leadId) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const start = parseDate(startTime);
        const end = parseDate(endTime);
        if (!start || !end) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }
        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: "Start time must be before end time",
            });
        }
        const appointment = await (0, booking_service_1.createNewAppointment)({
            businessId,
            leadId,
            name,
            email,
            phone,
            startTime: start,
            endTime: end,
        });
        return res.status(201).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create appointment",
        });
    }
};
exports.createAppointment = createAppointment;
const rescheduleAppointmentController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentId = req.params.appointmentId;
        const { startTime, endTime } = req.body;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!appointmentId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const start = parseDate(startTime);
        const end = parseDate(endTime);
        if (!start || !end) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }
        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: "Start time must be before end time",
            });
        }
        const appointment = await (0, booking_service_1.rescheduleAppointment)(businessId, appointmentId, start, end);
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        const statusCode = error?.message === "Appointment not found"
            ? 404
            : error?.message === "New slot not available"
                ? 409
                : 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to reschedule",
        });
    }
};
exports.rescheduleAppointmentController = rescheduleAppointmentController;
const cancelAppointment = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentId = req.params.appointmentId;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "Appointment ID required",
            });
        }
        const appointment = await (0, booking_service_1.cancelExistingAppointment)(businessId, appointmentId);
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(error?.message === "Appointment not found" ? 404 : 500).json({
            success: false,
            message: error.message || "Failed to cancel appointment",
        });
    }
};
exports.cancelAppointment = cancelAppointment;
const listAppointments = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Business ID missing",
            });
        }
        const bookings = await prisma_1.default.appointmentLedger.findMany({
            where: { businessId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                appointmentKey: true,
                startAt: true,
                endAt: true,
                status: true,
                meetingType: true,
            },
            take: 100,
        });
        return res.status(200).json({
            success: true,
            data: {
                bookings,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch bookings",
        });
    }
};
exports.listAppointments = listAppointments;
const requestAppointmentController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const { leadId, meetingType = "GENERAL", purpose = null, priority = "MEDIUM", timezone = "UTC", requestedWindow = null, durationMinutes = null, source = "SELF_SERVE", bookedBy = "SELF", locationType = "VIRTUAL", locationDetails = null, notes = null, assignedHumanId = null, assignedTeam = null, interactionId = null, metadata = null, traceId = null, } = req.body || {};
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId is required",
            });
        }
        const appointment = await appointmentEngine_service_1.appointmentEngineService.requestAppointment({
            businessId,
            leadId,
            meetingType,
            purpose,
            priority,
            timezone,
            requestedWindow,
            durationMinutes,
            source,
            bookedBy,
            locationType,
            locationDetails,
            notes,
            assignedHumanId,
            assignedTeam,
            interactionId,
            metadata,
            traceId,
        });
        return res.status(201).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to request appointment",
        });
    }
};
exports.requestAppointmentController = requestAppointmentController;
const holdAppointmentSlotController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        const { slotKey, holdTtlMinutes = 10, heldBy = "SELF" } = req.body || {};
        if (!businessId || !appointmentKey || !slotKey) {
            return res.status(400).json({
                success: false,
                message: "business, appointmentKey, and slotKey are required",
            });
        }
        const held = await appointmentEngine_service_1.appointmentEngineService.holdSlot({
            businessId,
            appointmentKey,
            slotKey,
            holdTtlMinutes: Number(holdTtlMinutes || 10),
            heldBy,
        });
        return res.status(200).json({
            success: true,
            data: held,
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to hold slot",
        });
    }
};
exports.holdAppointmentSlotController = holdAppointmentSlotController;
const confirmAppointmentSlotController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        const { holdToken = null, confirmedBy = "SELF" } = req.body || {};
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const appointment = await appointmentEngine_service_1.appointmentEngineService.confirmSlot({
            businessId,
            appointmentKey,
            holdToken,
            confirmedBy,
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to confirm appointment",
        });
    }
};
exports.confirmAppointmentSlotController = confirmAppointmentSlotController;
const rescheduleCanonicalAppointmentController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        const { newSlotKey, actor = "SELF", reason = "rescheduled_via_api" } = req.body || {};
        if (!businessId || !appointmentKey || !newSlotKey) {
            return res.status(400).json({
                success: false,
                message: "business, appointmentKey, and newSlotKey are required",
            });
        }
        const appointment = await rescheduleEngine_service_1.rescheduleEngineService.reschedule({
            businessId,
            appointmentKey,
            newSlotKey,
            actor,
            reason,
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to reschedule appointment",
        });
    }
};
exports.rescheduleCanonicalAppointmentController = rescheduleCanonicalAppointmentController;
const cancelCanonicalAppointmentController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        const { reason = "cancelled_via_api", actor = "SELF" } = req.body || {};
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const appointment = await appointmentEngine_service_1.appointmentEngineService.cancelAppointment({
            businessId,
            appointmentKey,
            reason,
            actor,
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to cancel appointment",
        });
    }
};
exports.cancelCanonicalAppointmentController = cancelCanonicalAppointmentController;
const checkInAppointmentController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const appointment = await meetingState.transition({
            businessId,
            appointmentKey,
            nextState: "CHECKED_IN",
            reason: "manual_check_in",
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to check in",
        });
    }
};
exports.checkInAppointmentController = checkInAppointmentController;
const runningLateController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const appointment = await meetingState.transition({
            businessId,
            appointmentKey,
            nextState: "LATE_JOIN",
            reason: "running_late_signal",
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to mark running late",
        });
    }
};
exports.runningLateController = runningLateController;
const addWaitlistRequestController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const { leadId, meetingType = "GENERAL", slotId = null, appointmentId = null, priorityScore = 0, reason = null, metadata = null, } = req.body || {};
        if (!businessId || !leadId) {
            return res.status(400).json({
                success: false,
                message: "business and leadId are required",
            });
        }
        const waitlist = await waitlistEngine_service_1.waitlistEngineService.addRequest({
            businessId,
            leadId,
            meetingType,
            slotId,
            appointmentId,
            priorityScore,
            reason,
            metadata,
        });
        return res.status(201).json({
            success: true,
            data: {
                waitlist,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to add waitlist request",
        });
    }
};
exports.addWaitlistRequestController = addWaitlistRequestController;
const getAppointmentOpsProjectionController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const from = parseDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = parseDate(req.query.to) || new Date();
        const projection = await appointmentProjection_service_1.appointmentProjectionService.getOpsProjection({
            businessId,
            from,
            to,
        });
        return res.status(200).json({
            success: true,
            data: projection,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to load appointment projection",
        });
    }
};
exports.getAppointmentOpsProjectionController = getAppointmentOpsProjectionController;
const recordAppointmentOutcomeController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        const { outcome = "COMPLETED", feedbackScore = null, notes = null, metadata = null } = req.body || {};
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const appointment = await appointmentOutcome_service_1.appointmentOutcomeService.complete({
            businessId,
            appointmentKey,
            outcome,
            feedbackScore,
            notes,
            metadata,
        });
        return res.status(200).json({
            success: true,
            data: {
                appointment,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to record appointment outcome",
        });
    }
};
exports.recordAppointmentOutcomeController = recordAppointmentOutcomeController;
const upsertMeetingArtifactsController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        const appointmentKey = String(req.params.appointmentKey || "").trim();
        if (!businessId || !appointmentKey) {
            return res.status(400).json({
                success: false,
                message: "business and appointmentKey are required",
            });
        }
        const { recordingRef = null, transcriptRef = null, notesRef = null, summaryRef = null, actionItems = null, nextStepRef = null, metadata = null, } = req.body || {};
        const artifact = await meetingArtifact_service_1.meetingArtifactService.upsertArtifacts({
            businessId,
            appointmentKey,
            recordingRef,
            transcriptRef,
            notesRef,
            summaryRef,
            actionItems,
            nextStepRef,
            metadata,
        });
        return res.status(200).json({
            success: true,
            data: {
                artifact,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to persist meeting artifacts",
        });
    }
};
exports.upsertMeetingArtifactsController = upsertMeetingArtifactsController;
const replayCalendarSyncWebhookController = async (req, res) => {
    try {
        const businessId = req.user?.businessId || null;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const { provider, externalEventId, dedupeFingerprint, externalUpdatedAtIso, cancelled = false, startAtIso = null, endAtIso = null, metadata = null, } = req.body || {};
        if (!provider || !externalEventId || !dedupeFingerprint || !externalUpdatedAtIso) {
            return res.status(400).json({
                success: false,
                message: "provider, externalEventId, dedupeFingerprint and externalUpdatedAtIso are required",
            });
        }
        await (0, calendarSync_queue_1.enqueueCalendarSyncWebhookJob)({
            businessId,
            provider,
            externalEventId,
            dedupeFingerprint,
            externalUpdatedAtIso,
            externalEventVersion: String(req.body?.externalEventVersion || "").trim() || null,
            cancelled,
            startAtIso,
            endAtIso,
            metadata,
        });
        return res.status(202).json({
            success: true,
            data: {
                queued: true,
            },
        });
    }
    catch (error) {
        return res.status(409).json({
            success: false,
            message: error.message || "Failed to replay calendar webhook",
        });
    }
};
exports.replayCalendarSyncWebhookController = replayCalendarSyncWebhookController;
