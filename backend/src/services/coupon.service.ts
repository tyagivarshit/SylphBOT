import { stripe } from "./stripe.service";

export const applyCoupon = async (couponCode: string) => {
  try {
    const coupons = await stripe.coupons.list({
      limit: 100,
    });

    const coupon = coupons.data.find(c => c.name === couponCode);

    if (!coupon) throw new Error("Invalid coupon");

    return coupon.id;

  } catch (err) {
    throw new Error("Coupon validation failed");
  }
};