"use strict";
/*
=====================================================
BOOKING AI UTILS
- date parsing
- time parsing
- slot matching
- formatting helpers
=====================================================
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSlotsList = exports.formatSlot = exports.findClosestSlot = exports.parseTimeFromText = exports.parseDateFromText = void 0;
/*
PARSE DATE FROM TEXT (basic NLP)
*/
const parseDateFromText = (text) => {
    const lower = text.toLowerCase();
    const today = new Date();
    if (lower.includes("today"))
        return today;
    if (lower.includes("tomorrow")) {
        const t = new Date();
        t.setDate(today.getDate() + 1);
        return t;
    }
    // simple dd/mm or yyyy-mm-dd detection
    const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/) ||
        text.match(/\d{2}\/\d{2}\/\d{4}/);
    if (dateMatch) {
        return new Date(dateMatch[0]);
    }
    return null;
};
exports.parseDateFromText = parseDateFromText;
/*
PARSE TIME FROM TEXT
*/
const parseTimeFromText = (text) => {
    const match = text.match(/(\d{1,2})(:\d{2})?\s?(am|pm)?/i);
    if (!match)
        return null;
    let hours = parseInt(match[1]);
    let minutes = match[2] ? parseInt(match[2].slice(1)) : 0;
    const meridian = match[3]?.toLowerCase();
    if (meridian === "pm" && hours < 12)
        hours += 12;
    if (meridian === "am" && hours === 12)
        hours = 0;
    return { hours, minutes };
};
exports.parseTimeFromText = parseTimeFromText;
/*
MATCH USER REQUEST WITH CLOSEST SLOT
*/
const findClosestSlot = (requested, availableSlots) => {
    if (!availableSlots.length)
        return null;
    let closest = availableSlots[0];
    let minDiff = Math.abs(requested.getTime() - closest.getTime());
    for (const slot of availableSlots) {
        const diff = Math.abs(requested.getTime() - slot.getTime());
        if (diff < minDiff) {
            minDiff = diff;
            closest = slot;
        }
    }
    return closest;
};
exports.findClosestSlot = findClosestSlot;
/*
FORMAT SLOT FOR CHAT
*/
const formatSlot = (date) => {
    return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
};
exports.formatSlot = formatSlot;
/*
FORMAT MULTIPLE SLOTS
*/
const formatSlotsList = (slots) => {
    return slots
        .map((slot, i) => `${i + 1}. ${(0, exports.formatSlot)(slot)}`)
        .join("\n");
};
exports.formatSlotsList = formatSlotsList;
