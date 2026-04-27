"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAvailability = exports.updateAvailability = exports.getAvailability = exports.createAvailability = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
const createAvailability = async (data) => {
    return prisma_1.default.bookingSlot.create({
        data: {
            businessId: data.businessId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            slotDuration: data.slotDuration ?? 30,
            bufferTime: data.bufferTime ?? 0,
            timezone: data.timezone ?? "UTC",
            isActive: true,
        },
    });
};
exports.createAvailability = createAvailability;
/*
=====================================================
GET AVAILABILITY
=====================================================
*/
const getAvailability = async (businessId) => {
    return prisma_1.default.bookingSlot.findMany({
        where: { businessId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
};
exports.getAvailability = getAvailability;
/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
const updateAvailability = async (businessId, id, data) => {
    const availability = await prisma_1.default.bookingSlot.findFirst({
        where: {
            id,
            businessId,
        },
    });
    if (!availability) {
        return null;
    }
    await prisma_1.default.bookingSlot.updateMany({
        where: {
            id: availability.id,
            businessId,
        },
        data,
    });
    return prisma_1.default.bookingSlot.findFirst({
        where: {
            id: availability.id,
            businessId,
        },
    });
};
exports.updateAvailability = updateAvailability;
/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
const deleteAvailability = async (businessId, id) => {
    const availability = await prisma_1.default.bookingSlot.findFirst({
        where: {
            id,
            businessId,
        },
        select: {
            id: true,
        },
    });
    if (!availability) {
        return null;
    }
    await prisma_1.default.bookingSlot.deleteMany({
        where: {
            id: availability.id,
            businessId,
        },
    });
    return availability;
};
exports.deleteAvailability = deleteAvailability;
