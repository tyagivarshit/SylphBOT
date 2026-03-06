import dotenv from "dotenv";

dotenv.config();

export const env = {
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY as string,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET as string, 
  FRONTEND_URL: process.env.FRONTEND_URL as string,
  STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO!,
  STRIPE_PRICE_ID_BASIC: process.env.STRIPE_PRICE_ID_BASIC,
  STRIPE_PRICE_ID_ENTERPRISE: process.env.STRIPE_PRICE_ID_ENTERPRISE,
};