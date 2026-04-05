"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelAppointment = exports.rescheduleAppointmentController = exports.createAppointment = exports.getAvailableSlots = void 0;
const booking_service_1 = require("../services/booking.service");
/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
const getAvailableSlots = async (req, res) => {
    try {
        const businessId = req.params.businessId;
        const date = req.query.date;
        if (!businessId || !date) {
            return res.status(400).json({
                success: false,
                message: "Business ID and date are required",
            });
        }
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }
        const slots = await (0, booking_service_1.fetchAvailableSlots)(businessId, parsedDate);
        return res.status(200).json({
            success: true,
            slots,
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
/*
=====================================================
CREATE APPOINTMENT (🔥 FIXED SECURITY)
=====================================================
*/
const createAppointment = async (req, res) => {
    try {
        const businessId = req.user?.businessId; // 🔥 FIX
        const { leadId, name, email, phone, startTime, endTime, } = req.body;
        if (!businessId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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
            appointment,
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
/*
=====================================================
RESCHEDULE APPOINTMENT
=====================================================
*/
const rescheduleAppointmentController = async (req, res) => {
    try {
        const appointmentId = req.params.appointmentId;
        const { startTime, endTime } = req.body;
        if (!appointmentId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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
        const updated = await (0, booking_service_1.rescheduleAppointment)(appointmentId, start, end);
        return res.status(200).json({
            success: true,
            appointment: updated,
        });
    }
    catch (error) {
        console.error("RESCHEDULE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to reschedule",
        });
    }
};
exports.rescheduleAppointmentController = rescheduleAppointmentController;
/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/
const cancelAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.appointmentId;
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "Appointment ID required",
            });
        }
        const appointment = await (0, booking_service_1.cancelExistingAppointment)(appointmentId);
        return res.status(200).json({
            success: true,
            appointment,
        });
    }
    catch (error) {
        console.error("CANCEL APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to cancel appointment",
        });
    }
};
exports.cancelAppointment = cancelAppointment;
