"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCoupon = void 0;
const stripe_service_1 = require("./stripe.service");
const applyCoupon = async (couponCode) => {
    try {
        const coupons = await stripe_service_1.stripe.coupons.list({
            limit: 100,
        });
        const coupon = coupons.data.find(c => c.name === couponCode);
        if (!coupon)
            throw new Error("Invalid coupon");
        return coupon.id;
    }
    catch (err) {
        throw new Error("Coupon validation failed");
    }
};
exports.applyCoupon = applyCoupon;
