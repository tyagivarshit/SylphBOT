import geoip from "geoip-lite";

export const getUserCountry = (ip: string) => {
  const geo = geoip.lookup(ip);
  return geo?.country || "IN";
};