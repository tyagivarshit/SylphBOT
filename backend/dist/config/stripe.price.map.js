"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStandardStripePriceCatalog = exports.getStripePriceId = exports.getPlanFromPrice = exports.STRIPE_PRICE_CATALOG = void 0;
const rawCatalog = [
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
exports.STRIPE_PRICE_CATALOG = rawCatalog.filter((entry) => Boolean(entry?.priceId));
const findCatalogEntry = (input) => exports.STRIPE_PRICE_CATALOG.find((entry) => {
    if (input.priceId && entry.priceId === input.priceId) {
        return true;
    }
    return ((input.plan ? entry.plan === input.plan : true) &&
        (input.currency ? entry.currency === input.currency : true) &&
        (input.billing ? entry.billing === input.billing : true) &&
        (typeof input.early === "boolean" ? entry.early === input.early : true));
}) || null;
const getPlanFromPrice = (priceId) => {
    const entry = findCatalogEntry({
        priceId: priceId || null,
    });
    return entry?.plan || null;
};
exports.getPlanFromPrice = getPlanFromPrice;
const getStripePriceId = (input) => findCatalogEntry({
    plan: input.plan,
    currency: input.currency,
    billing: input.billing,
    early: input.early,
})?.priceId || null;
exports.getStripePriceId = getStripePriceId;
const getStandardStripePriceCatalog = () => exports.STRIPE_PRICE_CATALOG.filter((entry) => !entry.early);
exports.getStandardStripePriceCatalog = getStandardStripePriceCatalog;
