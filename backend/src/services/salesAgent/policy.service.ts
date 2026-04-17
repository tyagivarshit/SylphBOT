import { getPlanKey } from "../../config/plan.config";
import type { SalesCapabilityProfile, SalesPlanKey } from "./types";

const CAPABILITY_MAP: Record<SalesPlanKey, SalesCapabilityProfile> = {
  FREE_LOCKED: {
    planKey: "FREE_LOCKED",
    label: "Locked",
    intelligenceTier: 0,
    maxQualificationQuestions: 0,
    supportBooking: false,
    supportPaymentLinks: false,
    enableFollowups: false,
    enableCRM: false,
    responseStyle: "engage",
    primaryCtas: ["NONE"],
    systemDirective: "Keep replies minimal and avoid premium flows.",
    qualificationTargets: [],
  },
  BASIC: {
    planKey: "BASIC",
    label: "Basic",
    intelligenceTier: 1,
    maxQualificationQuestions: 2,
    supportBooking: false,
    supportPaymentLinks: false,
    enableFollowups: false,
    enableCRM: false,
    responseStyle: "engage",
    primaryCtas: ["REPLY_DM", "CAPTURE_LEAD", "VIEW_DEMO"],
    systemDirective:
      "Turn comments and DMs into leads fast. Ask at most one sharp qualification question before pushing to DM or link.",
    qualificationTargets: ["need", "intentSignal"],
  },
  PRO: {
    planKey: "PRO",
    label: "Pro",
    intelligenceTier: 2,
    maxQualificationQuestions: 3,
    supportBooking: false,
    supportPaymentLinks: false,
    enableFollowups: true,
    enableCRM: true,
    responseStyle: "closer",
    primaryCtas: ["VIEW_DEMO", "BOOK_CALL", "CAPTURE_LEAD"],
    systemDirective:
      "Qualify deeply, handle objections, and push the lead toward a demo or sales call without sounding scripted.",
    qualificationTargets: ["need", "budget", "timeline", "intentSignal"],
  },
  ELITE: {
    planKey: "ELITE",
    label: "Elite",
    intelligenceTier: 3,
    maxQualificationQuestions: 4,
    supportBooking: true,
    supportPaymentLinks: true,
    enableFollowups: true,
    enableCRM: true,
    responseStyle: "autonomous",
    primaryCtas: ["BOOK_CALL", "BUY_NOW", "VIEW_DEMO"],
    systemDirective:
      "Act like a professional closer. Resolve friction quickly and guide the lead to a booking or payment in the fewest messages possible.",
    qualificationTargets: ["need", "budget", "timeline", "intentSignal"],
  },
};

export const resolveSalesPlanKey = (plan: unknown): SalesPlanKey =>
  getPlanKey((plan as { name?: string | null; type?: string | null }) || null);

export const getSalesCapabilityProfile = (plan: unknown) =>
  CAPABILITY_MAP[resolveSalesPlanKey(plan)];

export const isPaidSalesPlan = (plan: unknown) =>
  resolveSalesPlanKey(plan) !== "FREE_LOCKED";
