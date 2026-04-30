import Stripe from "stripe";
import { env } from "../config/env";

export const stripe = new Stripe(String(env.STRIPE_SECRET_KEY || ""), {
  apiVersion: "2023-10-16" as any,
  timeout: 10000,
});
