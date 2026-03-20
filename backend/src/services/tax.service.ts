export const getTaxConfig = (currency: string) => {

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