export type PlanType = "BASIC" | "PRO" | "ELITE";
export type BillingInterval = "monthly" | "yearly";
export type PricingCurrency = "INR" | "USD";

export type StripePriceCatalogEntry = {
  priceId: string;
  plan: PlanType;
  currency: PricingCurrency;
  billing: BillingInterval;
  early: boolean;
};

const rawCatalog: Array<StripePriceCatalogEntry | null> = [
  {
    priceId: process.env.STRIPE_BASIC_INR_MONTHLY || "",
    plan: "BASIC",
    currency: "INR",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_BASIC_INR_YEARLY || "",
    plan: "BASIC",
    currency: "INR",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_BASIC_INR_MONTHLY_EARLY || "",
    plan: "BASIC",
    currency: "INR",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_BASIC_INR_YEARLY_EARLY || "",
    plan: "BASIC",
    currency: "INR",
    billing: "yearly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_BASIC_USD_MONTHLY || "",
    plan: "BASIC",
    currency: "USD",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_BASIC_USD_YEARLY || "",
    plan: "BASIC",
    currency: "USD",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_BASIC_USD_MONTHLY_EARLY || "",
    plan: "BASIC",
    currency: "USD",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_BASIC_USD_YEARLY_EARLY || "",
    plan: "BASIC",
    currency: "USD",
    billing: "yearly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_PRO_INR_MONTHLY || "",
    plan: "PRO",
    currency: "INR",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_PRO_INR_YEARLY || "",
    plan: "PRO",
    currency: "INR",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_PRO_INR_MONTHLY_EARLY || "",
    plan: "PRO",
    currency: "INR",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_PRO_INR_YEARLY_EARLY || "",
    plan: "PRO",
    currency: "INR",
    billing: "yearly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_PRO_USD_MONTHLY || "",
    plan: "PRO",
    currency: "USD",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_PRO_USD_YEARLY || "",
    plan: "PRO",
    currency: "USD",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_PRO_USD_MONTHLY_EARLY || "",
    plan: "PRO",
    currency: "USD",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_PRO_USD_YEARLY_EARLY || "",
    plan: "PRO",
    currency: "USD",
    billing: "yearly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_ELITE_INR_MONTHLY || "",
    plan: "ELITE",
    currency: "INR",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_ELITE_INR_YEARLY || "",
    plan: "ELITE",
    currency: "INR",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_ELITE_INR_MONTHLY_EARLY || "",
    plan: "ELITE",
    currency: "INR",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_ELITE_INR_YEARLY_EARLY || "",
    plan: "ELITE",
    currency: "INR",
    billing: "yearly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_ELITE_USD_MONTHLY || "",
    plan: "ELITE",
    currency: "USD",
    billing: "monthly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_ELITE_USD_YEARLY || "",
    plan: "ELITE",
    currency: "USD",
    billing: "yearly",
    early: false,
  },
  {
    priceId: process.env.STRIPE_ELITE_USD_MONTHLY_EARLY || "",
    plan: "ELITE",
    currency: "USD",
    billing: "monthly",
    early: true,
  },
  {
    priceId: process.env.STRIPE_ELITE_USD_YEARLY_EARLY || "",
    plan: "ELITE",
    currency: "USD",
    billing: "yearly",
    early: true,
  },
];

export const STRIPE_PRICE_CATALOG = rawCatalog.filter(
  (entry): entry is StripePriceCatalogEntry => Boolean(entry?.priceId)
);

const findCatalogEntry = (
  input: Partial<Omit<StripePriceCatalogEntry, "priceId">> & {
    priceId?: string | null;
  }
) =>
  STRIPE_PRICE_CATALOG.find((entry) => {
    if (input.priceId && entry.priceId === input.priceId) {
      return true;
    }

    return (
      (input.plan ? entry.plan === input.plan : true) &&
      (input.currency ? entry.currency === input.currency : true) &&
      (input.billing ? entry.billing === input.billing : true) &&
      (typeof input.early === "boolean" ? entry.early === input.early : true)
    );
  }) || null;

export const getPlanFromPrice = (
  priceId: string | null | undefined
): PlanType | null => {
  const entry = findCatalogEntry({
    priceId: priceId || null,
  });

  return entry?.plan || null;
};

export const getStripePriceId = (input: {
  plan: PlanType;
  currency: PricingCurrency;
  billing: BillingInterval;
  early?: boolean;
}) =>
  findCatalogEntry({
    plan: input.plan,
    currency: input.currency,
    billing: input.billing,
    early: input.early,
  })?.priceId || null;

export const getStandardStripePriceCatalog = () =>
  STRIPE_PRICE_CATALOG.filter((entry) => !entry.early);
