"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchNext30DaysSlots = void 0;
const booking_service_1 = require("./booking.service");
const fetchNext30DaysSlots = async (businessId) => {
    try {
        const results = [];
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const currentDate = new Date();
            currentDate.setDate(today.getDate() + i);
            currentDate.setHours(0, 0, 0, 0);
            let slots = [];
            try {
                slots = await (0, booking_service_1.fetchAvailableSlots)(businessId, currentDate);
            }
            catch (error) {
                console.error("SLOT FETCH ERROR:", businessId, currentDate, error);
                continue;
            }
            if (!slots || slots.length === 0)
                continue;
            /* 🔥 FILTER PAST SLOTS (EXTRA SAFETY) */
            const validSlots = slots.filter((s) => s.getTime() > Date.now());
            if (!validSlots.length)
                continue;
            results.push({
                date: currentDate,
                slots: validSlots,
            });
        }
        /* 🔥 SORT ALL SLOTS (GLOBAL ORDER) */
        results.forEach((day) => {
            day.slots.sort((a, b) => a.getTime() - b.getTime());
        });
        return results;
    }
    catch (error) {
        console.error("FETCH 30 DAYS SLOTS ERROR:", error);
        return [];
    }
};
exports.fetchNext30DaysSlots = fetchNext30DaysSlots;
