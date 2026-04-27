import logger from "../../utils/logger";
import { refreshLeadIntelligenceProfile } from "./leadIntelligence.service";

export type CRMRefreshEventType =
  | "payment_completed"
  | "booking_confirmed"
  | "booking_completed"
  | "booking_missed"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "followup_sent";

const EVENT_SOURCE_MAP: Record<CRMRefreshEventType, string> = {
  payment_completed: "CRM_EVENT_PAYMENT_COMPLETED",
  booking_confirmed: "CRM_EVENT_BOOKING_CONFIRMED",
  booking_completed: "CRM_EVENT_BOOKING_COMPLETED",
  booking_missed: "CRM_EVENT_BOOKING_MISSED",
  booking_cancelled: "CRM_EVENT_BOOKING_CANCELLED",
  booking_rescheduled: "CRM_EVENT_BOOKING_RESCHEDULED",
  followup_sent: "CRM_EVENT_FOLLOWUP_SENT",
};

export const publishCRMRefreshEvent = async ({
  businessId,
  leadId,
  event,
  inputMessage,
  waitForSync = true,
}: {
  businessId: string;
  leadId: string;
  event: CRMRefreshEventType;
  inputMessage?: string | null;
  waitForSync?: boolean;
}) => {
  const refresh = refreshLeadIntelligenceProfile({
    businessId,
    leadId,
    inputMessage,
    source: EVENT_SOURCE_MAP[event],
  });

  if (waitForSync) {
    return await refresh;
  }

  void refresh.catch((error) => {
    logger.warn(
      {
        businessId,
        leadId,
        event,
        error,
      },
      "CRM refresh event processing failed"
    );
  });

  return null;
};
