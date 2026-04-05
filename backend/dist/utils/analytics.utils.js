"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateRange = void 0;
const getDateRange = (range) => {
    const end = new Date();
    const start = new Date();
    switch (range) {
        case "7d":
            start.setDate(end.getDate() - 7);
            break;
        case "30d":
            start.setDate(end.getDate() - 30);
            break;
        case "90d":
            start.setDate(end.getDate() - 90);
            break;
        default:
            start.setDate(end.getDate() - 7);
    }
    return { start, end };
};
exports.getDateRange = getDateRange;
