import { Request } from "express";
import geoip from "geoip-lite";

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
  (() => {
    const forwarded = req.headers["x-forwarded-for"];

    if (Array.isArray(forwarded)) {
      return forwarded[0]?.trim() || "";
    }

    if (typeof forwarded === "string") {
      return forwarded.split(",")[0]?.trim() || "";
    }

    return req.socket?.remoteAddress || "";
  })();

export const detectRequestCountry = (req: Request) => {
  const headerCountry = getCountryFromHeaders(req);

  if (headerCountry) {
    return headerCountry;
  }

  const geo = geoip.lookup(getIpAddress(req));
  return geo?.country?.toUpperCase() || "IN";
};

export const resolveBillingCurrency = (req: Request) => {
  return detectRequestCountry(req) === "IN" ? "INR" : "USD";
};
