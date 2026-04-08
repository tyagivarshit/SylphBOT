"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoices = exports.generateInvoiceNumber = void 0;
const stripe_service_1 = require("./stripe.service");
/* ================= 🔥 INVOICE NUMBER ================= */
const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const suffix = Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();
    return `INV-${year}${month}-${suffix}`;
};
exports.generateInvoiceNumber = generateInvoiceNumber;
/* ================= 🔥 GET INVOICES ================= */
const getInvoices = async (customerId) => {
    const invoices = await stripe_service_1.stripe.invoices.list({
        customer: customerId,
        limit: 10,
    });
    return invoices.data.map((inv) => {
        const invoiceAny = inv;
        const taxAmount = Array.isArray(invoiceAny.total_tax_amounts)
            ? invoiceAny.total_tax_amounts.reduce((sum, t) => sum + (t?.amount || 0), 0)
            : 0;
        return {
            id: inv.id,
            amount: inv.amount_paid || 0,
            subtotal: inv.subtotal || 0,
            taxAmount,
            currency: inv.currency?.toUpperCase() || "USD",
            created: inv.created,
            status: inv.status || "paid",
            hosted_invoice_url: inv.hosted_invoice_url || null,
            invoice_pdf: inv.invoice_pdf || null,
        };
    });
};
exports.getInvoices = getInvoices;
