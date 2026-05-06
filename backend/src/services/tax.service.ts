import type Stripe from "stripe";

type TaxRegion = "IN" | "GLOBAL";
type TaxType = "GST" | "VAT";

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

const resolveTaxProfile = (currency: string): { taxRegion: TaxRegion; taxType: TaxType } => {
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

export const getTaxConfig = (input: CheckoutTaxConfigInput): CheckoutTaxConfig => {
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
  const { taxType } = resolveTaxProfile(currency);

  return {
    subtotal,
    total,
    taxAmount,
    taxType,
    currency,
  };
};
