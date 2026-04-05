"use strict";
/* ======================================
CURRENT MONTH / YEAR
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEndOfMonth = exports.getStartOfMonth = exports.getCurrentMonthYear = void 0;
const getCurrentMonthYear = () => {
    const now = new Date();
    return {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    };
};
exports.getCurrentMonthYear = getCurrentMonthYear;
/* ======================================
START OF CURRENT MONTH
====================================== */
const getStartOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};
exports.getStartOfMonth = getStartOfMonth;
/* ======================================
END OF CURRENT MONTH
====================================== */
const getEndOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
};
exports.getEndOfMonth = getEndOfMonth;
