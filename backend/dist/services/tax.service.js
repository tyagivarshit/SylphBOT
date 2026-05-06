"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripeTaxDetails = exports.getTaxConfig = void 0;
const resolveTaxProfile = (currency) => {
    const normalizedCurrency = String(currency || "").trim().toUpperCase();
    if (normalizedCurrency === "INR") {
        return {
            taxRegion: "IN",
            taxType: "GST",
        };
    }
    return {
        taxRegion: "GLOBAL",
        taxType: "VAT",
    };
};
const getTaxConfig = (input) => {
    const taxProfile = resolveTaxProfile(input.currency);
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
    const { taxType } = resolveTaxProfile(currency);
    return {
        subtotal,
        total,
        taxAmount,
        taxType,
        currency,
    };
};
exports.getStripeTaxDetails = getStripeTaxDetails;
