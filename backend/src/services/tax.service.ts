import type Stripe from "stripe";

type TaxRegion = "AUTO" | "IN" | "GLOBAL";
type TaxType = "AUTO" | "GST" | "VAT" | "SALES_TAX";

type CheckoutTaxConfigInput = {
  currency: string;
  withCustomerUpdate?: boolean;
};

type CheckoutTaxConfig = Pick<
  Stripe.Checkout.SessionCreateParams,
  "automatic_tax" | "tax_id_collection" | "billing_address_collection" | "phone_number_collection"
> & {
  customer_update?: Stripe.Checkout.SessionCreateParams.CustomerUpdate;
  taxRegion: TaxRegion;
  taxType: TaxType;
};

const resolveTaxProfile = (): { taxRegion: TaxRegion; taxType: TaxType } => ({
  taxRegion: "AUTO",
  taxType: "AUTO",
});

const resolveInvoiceTaxType = (invoice: any): TaxType => {
  const totalTaxAmounts = Array.isArray(invoice?.total_tax_amounts)
    ? invoice.total_tax_amounts
    : [];
  const taxTypes = totalTaxAmounts
    .map((row: any) =>
      String(
        row?.tax_rate_details?.tax_type ||
          row?.tax_rate?.tax_type ||
          row?.tax_type ||
          ""
      )
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  if (taxTypes.some((taxType: string) => taxType.includes("sales_tax"))) {
    return "SALES_TAX";
  }

  if (taxTypes.some((taxType: string) => taxType.includes("gst"))) {
    return "GST";
  }

  if (taxTypes.some((taxType: string) => taxType.includes("vat"))) {
    return "VAT";
  }

  return "AUTO";
};

export const getTaxConfig = (input: CheckoutTaxConfigInput): CheckoutTaxConfig => {
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
          } as Stripe.Checkout.SessionCreateParams.CustomerUpdate,
        }
      : {}),
    taxRegion: taxProfile.taxRegion,
    taxType: taxProfile.taxType,
  };
};

export const getStripeTaxDetails = (invoice: any) => {
  const subtotal = invoice?.subtotal || 0;
  const total = invoice?.amount_paid || 0;
  const taxAmount =
    invoice?.total_tax_amounts?.reduce(
      (sum: number, taxRow: any) => sum + (taxRow?.amount || 0),
      0
    ) || 0;
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
