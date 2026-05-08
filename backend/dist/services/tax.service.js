"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripeTaxDetails = exports.getTaxConfig = void 0;
const resolveTaxProfile = () => ({
    taxRegion: "AUTO",
    taxType: "AUTO",
});
const resolveInvoiceTaxType = (invoice) => {
    const totalTaxAmounts = Array.isArray(invoice?.total_tax_amounts)
        ? invoice.total_tax_amounts
        : [];
    const taxTypes = totalTaxAmounts
        .map((row) => String(row?.tax_rate_details?.tax_type ||
        row?.tax_rate?.tax_type ||
        row?.tax_type ||
        "")
        .trim()
        .toLowerCase())
        .filter(Boolean);
    if (taxTypes.some((taxType) => taxType.includes("sales_tax"))) {
        return "SALES_TAX";
    }
    if (taxTypes.some((taxType) => taxType.includes("gst"))) {
        return "GST";
    }
    if (taxTypes.some((taxType) => taxType.includes("vat"))) {
        return "VAT";
    }
    return "AUTO";
};
const getTaxConfig = (input) => {
    const taxProfile = resolveTaxProfile();
    return {
        automatic_tax: {
            enabled: true,
        },
        tax_id_collection: {
            enabled: true,
        },
        billing_address_collection: "required",
        phone_number_collection: {
            enabled: true,
        },
        ...(input.withCustomerUpdate
            ? {
                customer_update: {
                    address: "auto",
                    name: "auto",
                },
            }
            : {}),
        taxRegion: taxProfile.taxRegion,
        taxType: taxProfile.taxType,
    };
};
exports.getTaxConfig = getTaxConfig;
const getStripeTaxDetails = (invoice) => {
    const subtotal = invoice?.subtotal || 0;
    const total = invoice?.amount_paid || 0;
    const taxAmount = invoice?.total_tax_amounts?.reduce((sum, taxRow) => sum + (taxRow?.amount || 0), 0) || 0;
    const currency = String(invoice?.currency || "INR").toUpperCase();
    const taxType = resolveInvoiceTaxType(invoice);
    return {
        subtotal,
        total,
        taxAmount,
        taxType,
        currency,
    };
};
exports.getStripeTaxDetails = getStripeTaxDetails;
