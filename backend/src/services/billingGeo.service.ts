import { Request } from "express";
import geoip from "geoip-lite";

export type BillingCurrency = "INR" | "USD";

const COUNTRY_HEADERS = [
  "x-country",
  "cf-ipcountry",
  "x-vercel-ip-country",
] as const;

const getCountryFromHeaders = (req: Request) => {
  for (const key of COUNTRY_HEADERS) {
    const value = req.headers[key];
    const country = Array.isArray(value) ? value[0] : value;

    if (country) {
      return String(country).toUpperCase();
    }
  }

  return null;
};

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "";

export const detectRequestCountry = (req: Request) => {
  const headerCountry = getCountryFromHeaders(req);

  if (headerCountry) {
    return headerCountry;
  }

  const geo = geoip.lookup(getIpAddress(req));

  return geo?.country?.toUpperCase() || "IN";
};

export const resolveBillingCurrency = (
  req: Request
): BillingCurrency => {
  return detectRequestCountry(req) === "IN" ? "INR" : "USD";
};
