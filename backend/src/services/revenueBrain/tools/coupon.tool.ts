import { applyCoupon } from "../../coupon.service";
import type {
  RevenueBrainContext,
  RevenueBrainCouponResult,
  RevenueBrainToolExecution,
} from "../types";

const COUPON_MATCHERS = [
  /\b(?:coupon|promo|discount)\s*(?:code)?\s*[:=-]?\s*([A-Z0-9_-]{3,32})\b/i,
  /\bcode\s*[:=-]?\s*([A-Z0-9_-]{3,32})\b/i,
];

const extractCouponCode = (message: string) => {
  for (const matcher of COUPON_MATCHERS) {
    const hit = message.match(matcher);

    if (hit?.[1]) {
      return hit[1].trim().toUpperCase();
    }
  }

  return null;
};

export const runCouponTool = async ({
  context,
}: {
  context: RevenueBrainContext;
}): Promise<{
  execution: RevenueBrainToolExecution;
  result: RevenueBrainCouponResult;
}> => {
  const mentioned = /\b(coupon|promo|discount)\b/i.test(context.inputMessage);
  const code = extractCouponCode(context.inputMessage);

  if (!mentioned) {
    return {
      execution: {
        name: "coupon",
        phase: "before_reply",
        status: "skipped",
        payload: {
          reason: "coupon_not_requested",
        },
      },
      result: {
        mentioned: false,
        code: null,
        valid: null,
        couponId: null,
        reason: "coupon_not_requested",
      },
    };
  }

  if (!code) {
    return {
      execution: {
        name: "coupon",
        phase: "before_reply",
        status: "applied",
        payload: {
          mentioned: true,
          code: null,
          valid: null,
        },
      },
      result: {
        mentioned: true,
        code: null,
        valid: null,
        couponId: null,
        reason: "coupon_code_missing",
      },
    };
  }

  try {
    const couponId = await applyCoupon(code);

    return {
      execution: {
        name: "coupon",
        phase: "before_reply",
        status: "applied",
        payload: {
          mentioned: true,
          code,
          valid: true,
        },
      },
      result: {
        mentioned: true,
        code,
        valid: true,
        couponId,
        reason: "coupon_valid",
      },
    };
  } catch (error: any) {
    return {
      execution: {
        name: "coupon",
        phase: "before_reply",
        status: "applied",
        payload: {
          mentioned: true,
          code,
          valid: false,
        },
      },
      result: {
        mentioned: true,
        code,
        valid: false,
        couponId: null,
        reason: error?.message || "coupon_invalid",
      },
    };
  }
};
