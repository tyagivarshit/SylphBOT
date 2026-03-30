import dotenv from "dotenv";

dotenv.config();

export const env = {
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY as string,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET as string,

  FRONTEND_URL: process.env.FRONTEND_URL as string,

  /* =========================
     BASIC - INR
  ========================= */
  STRIPE_BASIC_INR_MONTHLY: process.env.STRIPE_BASIC_INR_MONTHLY!,
  STRIPE_BASIC_INR_YEARLY: process.env.STRIPE_BASIC_INR_YEARLY!,
  STRIPE_BASIC_INR_MONTHLY_EARLY: process.env.STRIPE_BASIC_INR_MONTHLY_EARLY!,
  STRIPE_BASIC_INR_YEARLY_EARLY: process.env.STRIPE_BASIC_INR_YEARLY_EARLY!,

  /* =========================
     BASIC - USD
  ========================= */
  STRIPE_BASIC_USD_MONTHLY: process.env.STRIPE_BASIC_USD_MONTHLY!,
  STRIPE_BASIC_USD_YEARLY: process.env.STRIPE_BASIC_USD_YEARLY!,
  STRIPE_BASIC_USD_MONTHLY_EARLY: process.env.STRIPE_BASIC_USD_MONTHLY_EARLY!,
  STRIPE_BASIC_USD_YEARLY_EARLY: process.env.STRIPE_BASIC_USD_YEARLY_EARLY!,

  /* =========================
     PRO - INR
  ========================= */
  STRIPE_PRO_INR_MONTHLY: process.env.STRIPE_PRO_INR_MONTHLY!,
  STRIPE_PRO_INR_YEARLY: process.env.STRIPE_PRO_INR_YEARLY!,
  STRIPE_PRO_INR_MONTHLY_EARLY: process.env.STRIPE_PRO_INR_MONTHLY_EARLY!,
  STRIPE_PRO_INR_YEARLY_EARLY: process.env.STRIPE_PRO_INR_YEARLY_EARLY!,

  /* =========================
     PRO - USD
  ========================= */
  STRIPE_PRO_USD_MONTHLY: process.env.STRIPE_PRO_USD_MONTHLY!,
  STRIPE_PRO_USD_YEARLY: process.env.STRIPE_PRO_USD_YEARLY!,
  STRIPE_PRO_USD_MONTHLY_EARLY: process.env.STRIPE_PRO_USD_MONTHLY_EARLY!,
  STRIPE_PRO_USD_YEARLY_EARLY: process.env.STRIPE_PRO_USD_YEARLY_EARLY!,

  /* =========================
     ELITE - INR
  ========================= */
  STRIPE_ELITE_INR_MONTHLY: process.env.STRIPE_ELITE_INR_MONTHLY!,
  STRIPE_ELITE_INR_YEARLY: process.env.STRIPE_ELITE_INR_YEARLY!,
  STRIPE_ELITE_INR_MONTHLY_EARLY: process.env.STRIPE_ELITE_INR_MONTHLY_EARLY!,
  STRIPE_ELITE_INR_YEARLY_EARLY: process.env.STRIPE_ELITE_INR_YEARLY_EARLY!,

  /* =========================
     ELITE - USD
  ========================= */
  STRIPE_ELITE_USD_MONTHLY: process.env.STRIPE_ELITE_USD_MONTHLY!,
  STRIPE_ELITE_USD_YEARLY: process.env.STRIPE_ELITE_USD_YEARLY!,
  STRIPE_ELITE_USD_MONTHLY_EARLY: process.env.STRIPE_ELITE_USD_MONTHLY_EARLY!,
  STRIPE_ELITE_USD_YEARLY_EARLY: process.env.STRIPE_ELITE_USD_YEARLY_EARLY!,

  /* =========================
     TWILIO (WHATSAPP)
  ========================= */
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID as string,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN as string,
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER as string,

};