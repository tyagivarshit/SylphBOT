import type {
  CRMCustomerGraph,
  CRMLeadSignalSnapshot,
  CRMScoreSeeds,
} from "./leadIntelligence.service";

export type CRMCommercialState = "COLD" | "WARM" | "HOT" | "CONVERTED";

export type CRMConversationMode =
  | "NEW"
  | "ACTIVE_DIALOGUE"
  | "FOLLOWUP_ACTIVE"
  | "BOOKING_ACTIVE"
  | "HUMAN_HANDOFF"
  | "POST_CONVERSION"
  | "DORMANT";

export type CRMBookingState =
  | "UNBOOKED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "HISTORICAL";

export type CRMConversionState = "OPEN" | "BOOKED" | "WON";

export type CRMStateConsistency = {
  isConsistent: boolean;
  issues: string[];
};

export type CRMUnifiedStateGraph = {
  conversation: {
    mode: CRMConversationMode;
    stateName: string | null;
    reason: string;
  };
  commercial: {
    state: CRMCommercialState;
    reason: string;
  };
  booking: {
    state: CRMBookingState;
    reason: string;
    lastBookedAt: Date | null;
    nextAppointmentAt: Date | null;
    hasBookingHistory: boolean;
  };
  conversion: {
    state: CRMConversionState;
    reason: string;
    lastConvertedAt: Date | null;
  };
  lifecycle: {
    stage: string;
    status: string;
    reason: string;
    stale: boolean;
    daysSinceLastTouch: number | null;
  };
  consistency: CRMStateConsistency;
};

const BOOKING_FLOW_STATES = new Set([
  "BOOKING_SELECTION",
  "BOOKING_CONFIRMATION",
  "RESCHEDULE_FLOW",
]);

const normalizeText = (value?: unknown) => String(value || "").trim().toUpperCase();

const latestDate = (...values: Array<Date | null | undefined>) =>
  values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const daysBetween = (from?: Date | null, to?: Date | null) => {
  if (!from || !to) {
    return null;
  }

  return Math.max(0, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
};

const resolveBookingState = ({
  snapshot,
  normalizedStage,
}: {
  snapshot: CRMLeadSignalSnapshot;
  normalizedStage: string;
}) => {
  const cancelledCount = snapshot.appointments.filter(
    (appointment) => normalizeText(appointment.status) === "CANCELLED"
  ).length;
  const completedCount = snapshot.appointmentStats.completedCount;
  const bookedEventAt =
    snapshot.conversions.find(
      (event) => normalizeText(event.outcome) === "BOOKED_CALL"
    )?.occurredAt || null;
  const lastBookedAt = latestDate(
    snapshot.lead.lastBookedAt,
    bookedEventAt,
    snapshot.appointmentStats.nextAppointmentAt
  );

  if (snapshot.appointmentStats.upcomingCount > 0) {
    return {
      state: "SCHEDULED" as const,
      reason: "upcoming_appointment_detected",
      lastBookedAt,
      hasBookingHistory: true,
    };
  }

  if (completedCount > 0) {
    return {
      state: "COMPLETED" as const,
      reason: "completed_appointment_detected",
      lastBookedAt,
      hasBookingHistory: true,
    };
  }

  if (cancelledCount > 0) {
    return {
      state: "CANCELLED" as const,
      reason: "cancelled_appointment_detected",
      lastBookedAt,
      hasBookingHistory: true,
    };
  }

  if (snapshot.conversionStats.bookedCount > 0 || lastBookedAt) {
    return {
      state: "HISTORICAL" as const,
      reason: "historical_booking_signal_detected",
      lastBookedAt,
      hasBookingHistory: true,
    };
  }

  return {
    state: "UNBOOKED" as const,
    reason: "no_booking_signal_detected",
    lastBookedAt: null,
    hasBookingHistory: false,
  };
};

const resolveCommercialState = ({
  snapshot,
  seeds,
  normalizedRevenueState,
  bookingState,
}: {
  snapshot: CRMLeadSignalSnapshot;
  seeds: CRMScoreSeeds;
  normalizedRevenueState: string;
  bookingState: CRMBookingState;
}) => {
  if (
    snapshot.conversionStats.paymentCount > 0 ||
    normalizedRevenueState === "CONVERTED" ||
    snapshot.lead.lastConvertedAt
  ) {
    return {
      state: "CONVERTED" as const,
      reason: "payment_conversion_detected",
    };
  }

  if (
    bookingState === "SCHEDULED" ||
    seeds.buyingIntentScore >= 70 ||
    normalizedRevenueState === "HOT" ||
    snapshot.conversionStats.clickedCount > 0
  ) {
    return {
      state: "HOT" as const,
      reason:
        bookingState === "SCHEDULED"
          ? "active_booking_pipeline"
          : "high_buying_intent_detected",
    };
  }

  if (
    seeds.qualificationScore >= 40 ||
    normalizedRevenueState === "WARM" ||
    snapshot.conversionStats.repliedCount > 0 ||
    snapshot.messageStats.total >= 2
  ) {
    return {
      state: "WARM" as const,
      reason: "active_commercial_interest_detected",
    };
  }

  return {
    state: "COLD" as const,
    reason: "commercial_signal_below_threshold",
  };
};

const resolveConversationMode = ({
  snapshot,
  bookingState,
  commercialState,
  daysSinceLastTouch,
}: {
  snapshot: CRMLeadSignalSnapshot;
  bookingState: CRMBookingState;
  commercialState: CRMCommercialState;
  daysSinceLastTouch: number | null;
}) => {
  const conversationStateName = normalizeText(snapshot.conversationState.name);

  if (snapshot.lead.isHumanActive) {
    return {
      mode: "HUMAN_HANDOFF" as const,
      reason: "human_takeover_active",
    };
  }

  if (commercialState === "CONVERTED") {
    return {
      mode: "POST_CONVERSION" as const,
      reason: "commercial_state_converted",
    };
  }

  if (
    BOOKING_FLOW_STATES.has(conversationStateName) ||
    bookingState === "SCHEDULED"
  ) {
    return {
      mode: "BOOKING_ACTIVE" as const,
      reason:
        bookingState === "SCHEDULED"
          ? "scheduled_booking_present"
          : `conversation_state:${conversationStateName.toLowerCase()}`,
    };
  }

  if (
    snapshot.followups.schedule.length > 0 ||
    snapshot.lead.followupCount > 0
  ) {
    return {
      mode: "FOLLOWUP_ACTIVE" as const,
      reason: "followup_program_active",
    };
  }

  if (daysSinceLastTouch !== null && daysSinceLastTouch >= 30) {
    return {
      mode: "DORMANT" as const,
      reason: "long_inactivity_detected",
    };
  }

  if (snapshot.messageStats.total >= 2 || snapshot.analytics.aiReplyCount > 0) {
    return {
      mode: "ACTIVE_DIALOGUE" as const,
      reason: "recent_conversation_detected",
    };
  }

  return {
    mode: "NEW" as const,
    reason: "conversation_not_started",
  };
};

const resolveLifecycleStatus = (stage: string) => {
  if (stage === "CONVERTED") return "CLOSED";
  if (stage === "AT_RISK" || stage === "DORMANT") return "RECOVERY";
  if (stage === "NURTURING") return "FOLLOWUP";
  return "ACTIVE";
};

const buildConsistency = ({
  snapshot,
  bookingState,
  commercialState,
  lifecycleStage,
}: {
  snapshot: CRMLeadSignalSnapshot;
  bookingState: CRMBookingState;
  commercialState: CRMCommercialState;
  lifecycleStage: string;
}): CRMStateConsistency => {
  const issues: string[] = [];
  const normalizedStage = normalizeText(snapshot.lead.stage);

  if (
    bookingState === "SCHEDULED" &&
    commercialState === "CONVERTED" &&
    snapshot.conversionStats.paymentCount === 0 &&
    !snapshot.lead.lastConvertedAt
  ) {
    issues.push("booked_without_payment_marked_converted");
  }

  if (
    bookingState !== "SCHEDULED" &&
    normalizedStage === "BOOKED_CALL" &&
    snapshot.appointmentStats.upcomingCount === 0
  ) {
    issues.push("lead_stage_booked_without_active_booking");
  }

  if (
    commercialState === "CONVERTED" &&
    lifecycleStage !== "CONVERTED"
  ) {
    issues.push("commercial_conversion_lifecycle_mismatch");
  }

  return {
    isConsistent: issues.length === 0,
    issues,
  };
};

export const resolveUnifiedCustomerState = ({
  snapshot,
  graph,
  seeds,
}: {
  snapshot: CRMLeadSignalSnapshot;
  graph: CRMCustomerGraph;
  seeds: CRMScoreSeeds;
}): CRMUnifiedStateGraph => {
  const daysSinceLastTouch = daysBetween(graph.enrichment.lastTouchAt, snapshot.now);
  const normalizedStage = normalizeText(snapshot.lead.stage);
  const normalizedRevenueState = normalizeText(
    snapshot.lead.revenueState || snapshot.lead.aiStage
  );
  const objection = normalizeText(snapshot.salesSignals.objection);
  const paymentEventAt =
    snapshot.conversions.find(
      (event) => normalizeText(event.outcome) === "PAYMENT_COMPLETED"
    )?.occurredAt || null;
  const booking = resolveBookingState({
    snapshot,
    normalizedStage,
  });
  const commercial = resolveCommercialState({
    snapshot,
    seeds,
    normalizedRevenueState,
    bookingState: booking.state,
  });
  const conversation = resolveConversationMode({
    snapshot,
    bookingState: booking.state,
    commercialState: commercial.state,
    daysSinceLastTouch,
  });

  let lifecycleStage = "NEW";
  let lifecycleReason = "stage:new";

  if (commercial.state === "CONVERTED") {
    lifecycleStage = "CONVERTED";
    lifecycleReason = "payment_conversion_detected";
  } else if (booking.state === "SCHEDULED") {
    lifecycleStage = "BOOKED";
    lifecycleReason = "active_booking_detected";
  } else if (daysSinceLastTouch !== null && daysSinceLastTouch >= 30) {
    lifecycleStage = "DORMANT";
    lifecycleReason = "long_inactivity_detected";
  } else if (
    (daysSinceLastTouch !== null &&
      daysSinceLastTouch >= 7 &&
      snapshot.lead.followupCount >= 2) ||
    objection === "NOT_INTERESTED"
  ) {
    lifecycleStage = "AT_RISK";
    lifecycleReason = "engagement_decay_detected";
  } else if (commercial.state === "HOT") {
    lifecycleStage = "OPPORTUNITY";
    lifecycleReason = "commercial_state_hot";
  } else if (
    seeds.qualificationScore >= 55 &&
    snapshot.salesSignals.qualificationMissing.length <= 1
  ) {
    lifecycleStage = "QUALIFIED";
    lifecycleReason = "qualification_threshold_met";
  } else if (conversation.mode === "FOLLOWUP_ACTIVE") {
    lifecycleStage = "NURTURING";
    lifecycleReason = "followup_program_active";
  } else if (
    snapshot.messageStats.total >= 2 ||
    seeds.engagementScore >= 45 ||
    conversation.mode === "ACTIVE_DIALOGUE"
  ) {
    lifecycleStage = "ENGAGED";
    lifecycleReason = "recent_conversation_detected";
  }

  const conversionState: CRMConversionState =
    commercial.state === "CONVERTED"
      ? "WON"
      : booking.hasBookingHistory
        ? "BOOKED"
        : "OPEN";
  const lifecycleStatus = resolveLifecycleStatus(lifecycleStage);
  const consistency = buildConsistency({
    snapshot,
    bookingState: booking.state,
    commercialState: commercial.state,
    lifecycleStage,
  });

  return {
    conversation: {
      mode: conversation.mode,
      stateName: snapshot.conversationState.name || null,
      reason: conversation.reason,
    },
    commercial,
    booking: {
      state: booking.state,
      reason: booking.reason,
      lastBookedAt: booking.lastBookedAt,
      nextAppointmentAt: snapshot.appointmentStats.nextAppointmentAt,
      hasBookingHistory: booking.hasBookingHistory,
    },
    conversion: {
      state: conversionState,
      reason:
        conversionState === "WON"
          ? "payment_conversion_detected"
          : conversionState === "BOOKED"
            ? "booking_signal_detected"
            : "conversion_not_started",
      lastConvertedAt: latestDate(snapshot.lead.lastConvertedAt, paymentEventAt),
    },
    lifecycle: {
      stage: lifecycleStage,
      status: lifecycleStatus,
      reason: lifecycleReason,
      stale:
        lifecycleStage !== "CONVERTED" &&
        lifecycleStage !== "BOOKED" &&
        daysSinceLastTouch !== null &&
        daysSinceLastTouch >= 7,
      daysSinceLastTouch,
    },
    consistency,
  };
};
