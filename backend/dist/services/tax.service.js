"use strict";
/* ======================================
STRIPE TAX CONFIG (PAYMENT SIDE)
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripeTaxDetails = exports.getTaxConfig = void 0;
const getTaxConfig = (currency) => {
    /* 🔥 BASE CONFIG */
    const base = {
        automatic_tax: { enabled: true },
        customer_update: {
            address: "auto",
        },
    };
    /* ======================================
    REGION-SPECIFIC (FUTURE READY)
    ====================================== */
    if (currency === "INR") {
        return {
            ...base,
            // GST handled automatically via Stripe Tax
        };
    }
    if (currency === "USD") {
        return {
            ...base,
            // US Sales Tax (state-based)
        };
    }
    /* 🌍 FALLBACK (EU / GLOBAL) */
    return {
        ...base,
        // VAT / global tax auto-handled
    };
};
exports.getTaxConfig = getTaxConfig;
/* ======================================
🔥 STRIPE TAX DETAILS (INVOICE SIDE)
====================================== */
const getStripeTaxDetails = (invoice) => {
    /* 🔥 SUBTOTAL */
    const subtotal = invoice.subtotal || 0;
    /* 🔥 TOTAL (PAID) */
    const total = invoice.amount_paid || 0;
    /* 🔥 REAL TAX FROM STRIPE */
    const taxAmount = invoice.total_tax_amounts?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    /* 🔥 TAX TYPE DETECT */
    const currency = invoice.currency?.toUpperCase() || "INR";
    const taxType = currency === "INR" ? "GST" : "VAT";
    return {
        subtotal,
        total,
        taxAmount,
        taxType,
        currency,
    };
};
exports.getStripeTaxDetails = getStripeTaxDetails;
