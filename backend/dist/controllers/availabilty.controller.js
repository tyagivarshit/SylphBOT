"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAvailabilityController = exports.updateAvailabilityController = exports.getAvailabilityController = exports.createAvailabilityController = void 0;
const availability_model_1 = require("../models/availability.model");
/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
const createAvailabilityController = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const { dayOfWeek, startTime, endTime, slotDuration, bufferTime, timezone, } = req.body;
        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Business not found in token",
            });
        }
        if (dayOfWeek === undefined || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        if (startTime >= endTime) {
            return res.status(400).json({
                success: false,
                message: "Start time must be before end time",
            });
        }
        const availability = await (0, availability_model_1.createAvailability)({
            businessId,
            dayOfWeek,
            startTime,
            endTime,
            slotDuration,
            bufferTime,
            timezone,
        });
        return res.status(201).json({
            success: true,
            availability,
        });
    }
    catch (error) {
        console.error("CREATE AVAILABILITY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create availability",
        });
    }
};
exports.createAvailabilityController = createAvailabilityController;
/*
=====================================================
🔥 GET AVAILABILITY (FIXED FOR PARAM ROUTE)
=====================================================
*/
const getAvailabilityController = async (req, res) => {
    try {
        const businessId = req.params.businessId;
        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId param required",
            });
        }
        const availability = await (0, availability_model_1.getAvailability)(businessId);
        return res.status(200).json({
            success: true,
            availability,
        });
    }
    catch (error) {
        console.error("GET AVAILABILITY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch availability",
        });
    }
};
exports.getAvailabilityController = getAvailabilityController;
/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
const updateAvailabilityController = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Availability ID required",
            });
        }
        if (req.body.startTime && req.body.endTime) {
            if (req.body.startTime >= req.body.endTime) {
                return res.status(400).json({
                    success: false,
                    message: "Start time must be before end time",
                });
            }
        }
        const availability = await (0, availability_model_1.updateAvailability)(id, req.body);
        return res.status(200).json({
            success: true,
            availability,
        });
    }
    catch (error) {
        console.error("UPDATE AVAILABILITY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update availability",
        });
    }
};
exports.updateAvailabilityController = updateAvailabilityController;
/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
const deleteAvailabilityController = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Availability ID required",
            });
        }
        await (0, availability_model_1.deleteAvailability)(id);
        return res.status(200).json({
            success: true,
            message: "Availability deleted",
        });
    }
    catch (error) {
        console.error("DELETE AVAILABILITY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete availability",
        });
    }
};
exports.deleteAvailabilityController = deleteAvailabilityController;
