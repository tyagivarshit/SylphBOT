"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAppointments = exports.cancelAppointment = exports.rescheduleAppointmentController = exports.createAppointment = exports.getAvailableSlots = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const booking_service_1 = require("../services/booking.service");
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
        console.error("GET SLOTS ERROR:", error);
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
        if (!businessId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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
        console.error("CREATE APPOINTMENT ERROR:", error);
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
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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
        console.error("RESCHEDULE ERROR:", error);
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
        console.error("CANCEL APPOINTMENT ERROR:", error);
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
        const bookings = await prisma_1.default.appointment.findMany({
            where: { businessId },
            orderBy: { startTime: "asc" },
            select: {
                id: true,
                name: true,
                startTime: true,
                status: true,
            },
        });
        const formattedBookings = bookings.map((booking) => ({
            id: booking.id,
            name: booking.name,
            startTime: booking.startTime.toISOString(),
            status: booking.status,
        }));
        return res.status(200).json({
            success: true,
            data: {
                bookings: formattedBookings,
            },
        });
    }
    catch (error) {
        console.error("GET BOOKINGS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch bookings",
        });
    }
};
exports.listAppointments = listAppointments;
