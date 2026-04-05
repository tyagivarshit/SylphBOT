"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAvailability = exports.updateAvailability = exports.getAvailability = exports.createAvailability = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
const createAvailability = async (data) => {
    return prisma.bookingSlot.create({
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
    return prisma.bookingSlot.findMany({
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
const updateAvailability = async (id, data) => {
    return prisma.bookingSlot.update({
        where: { id },
        data,
    });
};
exports.updateAvailability = updateAvailability;
/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
const deleteAvailability = async (id) => {
    return prisma.bookingSlot.delete({
        where: { id },
    });
};
exports.deleteAvailability = deleteAvailability;
