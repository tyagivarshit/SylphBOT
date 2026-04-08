/* ======================================
STRIPE TAX CONFIG (PAYMENT SIDE)
====================================== */

export const getTaxConfig = (currency: string) => {

  /* 🔥 BASE CONFIG */
  const base = {
    automatic_tax: { enabled: true },
    customer_update: {
      address: "auto",
      name: "auto",
    },
    tax_id_collection: {
      enabled: true,
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


/* ======================================
🔥 STRIPE TAX DETAILS (INVOICE SIDE)
====================================== */

export const getStripeTaxDetails = (invoice: any) => {

  /* 🔥 SUBTOTAL */
  const subtotal = invoice.subtotal || 0;

  /* 🔥 TOTAL (PAID) */
  const total = invoice.amount_paid || 0;

  /* 🔥 REAL TAX FROM STRIPE */
  const taxAmount =
    invoice.total_tax_amounts?.reduce(
      (sum: number, t: any) => sum + (t.amount || 0),
      0
    ) || 0;

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
