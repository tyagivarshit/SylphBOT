import { addHours, differenceInHours, subDays } from "date-fns";
import type {
  AutonomousEngine,
  AutonomousGuardrailDecision,
  AutonomousLeadSnapshot,
} from "./types";

const AUTONOMOUS_COOLDOWN_HOURS = 24;
const RECENT_USER_REPLY_HOURS = 6;
const MAX_AUTONOMOUS_TOUCHES_14D = 3;
const MAX_OUTBOUND_MESSAGES_7D = 6;
const QUIET_HOUR_START = 21;
const QUIET_HOUR_END = 8;

const isOutboundMessage = (sender: string) => {
  const normalized = String(sender || "").trim().toUpperCase();
  return normalized === "AI" || normalized === "AGENT";
};

const resolveLocalHour = (date: Date, timezone?: string | null) => {
  if (!timezone) {
    return date.getHours();
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    });
    const parts = formatter.formatToParts(date);
    const value = parts.find((part) => part.type === "hour")?.value;
    const hour = Number(value || NaN);
    return Number.isFinite(hour) ? hour : date.getHours();
  } catch {
    return date.getHours();
  }
};

const isCustomerLifecycleEngine = (engine: AutonomousEngine) =>
  engine === "expansion" || engine === "retention" || engine === "referral";

const findMostRecentDate = (values: Array<Date | null | undefined>) =>
  values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

export const evaluateAutonomousOutreachGuardrails = ({
  snapshot,
  engine,
}: {
  snapshot: AutonomousLeadSnapshot;
  engine: AutonomousEngine;
}): AutonomousGuardrailDecision => {
  const blockedReasons = new Set<string>();
  const now = snapshot.now;
  const quietHour = resolveLocalHour(now, snapshot.business.timezone);
  const quietHoursActive =
    quietHour >= QUIET_HOUR_START || quietHour < QUIET_HOUR_END;
  const lastUserMessage =
    snapshot.recentMessages.find(
      (message) => String(message.sender || "").toUpperCase() === "USER"
    ) || null;
  const recentOutboundMessages = snapshot.recentMessages.filter(
    (message) =>
      isOutboundMessage(message.sender) &&
      message.createdAt >= subDays(now, 7)
  );
  const autonomousContacts = snapshot.recentCampaigns.filter(
    (campaign) =>
      (campaign.status === "QUEUED" || campaign.status === "DISPATCHED") &&
      campaign.createdAt >= subDays(now, 14)
  );
  const lastAutonomousCampaign =
    snapshot.recentCampaigns
      .filter(
        (campaign) =>
          campaign.dispatchedAt || campaign.queuedAt || campaign.createdAt
      )
      .sort(
        (left, right) =>
          (right.dispatchedAt || right.queuedAt || right.createdAt).getTime() -
          (left.dispatchedAt || left.queuedAt || left.createdAt).getTime()
      )[0] || null;
  const lastOutboundAt = findMostRecentDate([
    recentOutboundMessages[0]?.createdAt || null,
    lastAutonomousCampaign?.dispatchedAt || null,
    lastAutonomousCampaign?.queuedAt || null,
  ]);
  const lastAutonomousAt =
    lastAutonomousCampaign?.dispatchedAt ||
    lastAutonomousCampaign?.queuedAt ||
    lastAutonomousCampaign?.createdAt ||
    null;
  const bookedOrConverted = Boolean(
    snapshot.lead.lastBookedAt ||
      snapshot.lead.lastConvertedAt ||
      snapshot.conversions.some((item) =>
        ["booked_call", "payment_completed"].includes(
          String(item.outcome || "").toLowerCase()
        )
      )
  );

  if (!snapshot.client?.accessTokenEncrypted) {
    blockedReasons.add("missing_client_connection");
  }

  if (String(snapshot.lead.platform || "").toUpperCase() === "WHATSAPP") {
    if (!snapshot.lead.phone || !snapshot.client?.phoneNumberId) {
      blockedReasons.add("missing_whatsapp_delivery_context");
    }
  }

  if (String(snapshot.lead.platform || "").toUpperCase() === "INSTAGRAM") {
    if (!snapshot.lead.instagramId) {
      blockedReasons.add("missing_instagram_delivery_context");
    }
  }

  if (snapshot.lead.isHumanActive) {
    blockedReasons.add("human_takeover_active");
  }

  if (String(snapshot.lead.stage || "").toUpperCase() === "CLOSED") {
    blockedReasons.add("lead_closed");
  }

  if (
    !isCustomerLifecycleEngine(engine) &&
    String(snapshot.lead.stage || "").toUpperCase() === "BOOKED_CALL"
  ) {
    blockedReasons.add("customer_stage_requires_customer_engine");
  }

  if (quietHoursActive) {
    blockedReasons.add("quiet_hours_active");
  }

  if (
    lastUserMessage &&
    differenceInHours(now, lastUserMessage.createdAt) <
      RECENT_USER_REPLY_HOURS
  ) {
    blockedReasons.add("recent_user_engagement");
  }

  if (
    lastOutboundAt &&
    differenceInHours(now, lastOutboundAt) < AUTONOMOUS_COOLDOWN_HOURS
  ) {
    blockedReasons.add("autonomous_cooldown_active");
  }

  if (autonomousContacts.length >= MAX_AUTONOMOUS_TOUCHES_14D) {
    blockedReasons.add("autonomous_touch_cap_reached");
  }

  if (recentOutboundMessages.length >= MAX_OUTBOUND_MESSAGES_7D) {
    blockedReasons.add("outbound_message_cap_reached");
  }

  if (isCustomerLifecycleEngine(engine) && !bookedOrConverted) {
    blockedReasons.add("customer_lifecycle_not_established");
  }

  const nextEligibleDates = [
    lastOutboundAt ? addHours(lastOutboundAt, AUTONOMOUS_COOLDOWN_HOURS) : null,
    quietHoursActive
      ? addHours(now, quietHour >= QUIET_HOUR_START ? 24 - quietHour + 8 : 8 - quietHour)
      : null,
    lastUserMessage
      ? addHours(lastUserMessage.createdAt, RECENT_USER_REPLY_HOURS)
      : null,
  ].filter((value): value is Date => value instanceof Date);

  nextEligibleDates.sort((left, right) => left.getTime() - right.getTime());

  return {
    allowed: blockedReasons.size === 0,
    blockedReasons: Array.from(blockedReasons),
    nextEligibleAt: nextEligibleDates[0]?.toISOString() || null,
    quietHoursActive,
    recentAutonomousContacts: autonomousContacts.length,
    recentOutboundMessages: recentOutboundMessages.length,
    lastAutonomousAt: lastAutonomousAt?.toISOString() || null,
    lastOutboundAt: lastOutboundAt?.toISOString() || null,
  };
};
