import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { resolveConsentAuthority } from "./consentAuthority.service";
import { resolveReminderCadence } from "./bookingPolicy.service";
import { enqueueAppointmentReminderJob } from "../queues/appointmentOps.queue";
import { appointmentEngineService } from "./appointmentEngine.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";

const REMINDER_CAP_PER_APPOINTMENT = 8;

const CADENCE_TO_OFFSET_MINUTES: Record<string, number> = {
  "72H": 72 * 60,
  "48H": 48 * 60,
  "24H": 24 * 60,
  "2H": 2 * 60,
  "30M": 30,
  "5M": 5,
};

const normalizeReminderType = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

const buildReminderDedupeKey = ({
  appointmentId,
  reminderType,
}: {
  appointmentId: string;
  reminderType: string;
}) => `appointment_reminder:${appointmentId}:${normalizeReminderType(reminderType)}`;

const buildReminderMessage = ({
  reminderType,
  appointment,
}: {
  reminderType: string;
  appointment: any;
}) => {
  const type = normalizeReminderType(reminderType);
  const startLabel = appointment.startAt
    ? new Date(appointment.startAt).toLocaleString("en-US", {
        timeZone: appointment.timezone || "UTC",
      })
    : "soon";
  const joinLine = appointment.meetingJoinUrl
    ? `\nJoin: ${appointment.meetingJoinUrl}`
    : "";

  switch (type) {
    case "72H":
      return `Reminder: your ${appointment.meetingType} is coming up in 72 hours.\nTime: ${startLabel}${joinLine}`;
    case "48H":
      return `Reminder: your ${appointment.meetingType} is coming up in 48 hours.\nTime: ${startLabel}${joinLine}`;
    case "24H":
      return `Reminder: your ${appointment.meetingType} is in 24 hours.\nTime: ${startLabel}${joinLine}`;
    case "2H":
      return `Reminder: your ${appointment.meetingType} starts in 2 hours.\nTime: ${startLabel}${joinLine}`;
    case "30M":
      return `Reminder: your ${appointment.meetingType} starts in 30 minutes.\nTime: ${startLabel}${joinLine}`;
    case "5M":
      return `Reminder: your ${appointment.meetingType} starts in 5 minutes.${joinLine}`;
    case "WHITE_GLOVE":
      return `Priority concierge reminder for your ${appointment.meetingType}.\nTime: ${startLabel}${joinLine}`;
    case "MISSED_JOIN":
      return `We missed you for ${appointment.meetingType}. Reply to recover your slot quickly.`;
    case "FOLLOWUP":
      return `Would you like a follow-up appointment? Reply with your preferred time.`;
    default:
      return `Reminder for your ${appointment.meetingType}.`;
  }
};

const shouldSendReminderForStatus = (status: string) =>
  ["CONFIRMED", "RESCHEDULED", "REMINDER_SENT", "CHECKED_IN", "LATE_JOIN"].includes(
    String(status || "").trim().toUpperCase()
  );

export const createAppointmentReminderService = () => ({
  scheduleCoreCadence: async ({
    businessId,
    appointmentId,
    appointmentKey,
    leadId,
    startAt,
    noShowRisk = 0,
    isVip = false,
    channel = "WHATSAPP",
    consentScope = "CONVERSATIONAL_OUTBOUND",
    metadata = null,
  }: {
    businessId: string;
    appointmentId: string;
    appointmentKey: string;
    leadId: string;
    startAt: Date;
    noShowRisk?: number;
    isVip?: boolean;
    channel?: string;
    consentScope?: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId,
    }).catch(() => null);
    const runtimeRisk = Number(runtime?.predictions.no_show_probability || 0) * 100;
    const adjustedNoShowRisk = Math.max(
      0,
      Math.min(
        100,
        Math.max(noShowRisk, runtimeRisk) +
          Number(runtime?.controls.booking.noShowMitigationLevel || 0) * 12
      )
    );
    const cadence = resolveReminderCadence({
      noShowRisk: adjustedNoShowRisk,
      isVip: isVip || Number(runtime?.predictions.vip_potential || 0) >= 0.75,
      aggression: Number(runtime?.controls.booking.reminderIntensity || 0),
    });
    const scheduled: any[] = [];
    const now = Date.now();

    const existingCount = await prisma.appointmentReminderLedger.count({
      where: {
        businessId,
        appointmentId,
      },
    });

    if (existingCount >= REMINDER_CAP_PER_APPOINTMENT) {
      return {
        scheduled: [],
        skipped: true,
        reason: "reminder_cap_reached",
      };
    }

    for (const reminderType of cadence) {
      const offsetMinutes = CADENCE_TO_OFFSET_MINUTES[reminderType];

      if (!Number.isFinite(offsetMinutes)) {
        continue;
      }

      const scheduledFor = new Date(startAt.getTime() - offsetMinutes * 60_000);

      if (scheduledFor.getTime() <= now) {
        continue;
      }

      const dedupeKey = buildReminderDedupeKey({
        appointmentId,
        reminderType,
      });

      const reminder = await prisma.appointmentReminderLedger.upsert({
        where: {
          dedupeKey,
        },
        update: {
          scheduledFor,
          status: "SCHEDULED",
          channel,
          consentScope,
          metadata: mergeAppointmentMetadata(
            parseAppointmentMetadata(metadata),
            {
              source: "appointment_reminder_service",
              appointmentKey,
              noShowRisk: adjustedNoShowRisk,
              isVip,
              intelligencePolicyVersion: runtime?.policyVersion || null,
            }
          ) as Prisma.InputJsonValue,
        },
        create: {
          businessId,
          appointmentId,
          leadId,
          reminderType,
          scheduledFor,
          channel,
          consentScope,
          status: "SCHEDULED",
          dedupeKey,
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(metadata), {
            source: "appointment_reminder_service",
            appointmentKey,
            noShowRisk: adjustedNoShowRisk,
            isVip,
            intelligencePolicyVersion: runtime?.policyVersion || null,
          }) as Prisma.InputJsonValue,
        },
      });

      await enqueueAppointmentReminderJob({
        reminderId: reminder.id,
        dedupeKey: reminder.dedupeKey,
      });

      scheduled.push(reminder);

      if (scheduled.length + existingCount >= REMINDER_CAP_PER_APPOINTMENT) {
        break;
      }
    }

    return {
      scheduled,
      skipped: false,
    };
  },

  processReminderJob: async ({
    reminderId,
  }: {
    reminderId: string;
  }) => {
    const reminder = await prisma.appointmentReminderLedger.findFirst({
      where: {
        id: reminderId,
      },
    });

    if (!reminder) {
      return {
        sent: false,
        skipped: true,
        reason: "reminder_not_found",
      };
    }

    if (["SENT", "SUPPRESSED"].includes(reminder.status)) {
      return {
        sent: reminder.status === "SENT",
        skipped: true,
        reason: "already_processed",
      };
    }

    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        id: reminder.appointmentId,
      },
    });

    if (!appointment) {
      await prisma.appointmentReminderLedger.update({
        where: {
          id: reminder.id,
        },
        data: {
          status: "SKIPPED",
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(reminder.metadata), {
            skippedReason: "appointment_missing",
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        sent: false,
        skipped: true,
        reason: "appointment_missing",
      };
    }

    if (!shouldSendReminderForStatus(appointment.status)) {
      await prisma.appointmentReminderLedger.update({
        where: {
          id: reminder.id,
        },
        data: {
          status: "SKIPPED",
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(reminder.metadata), {
            skippedReason: `status:${appointment.status}`,
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        sent: false,
        skipped: true,
        reason: `status:${appointment.status}`,
      };
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: reminder.leadId,
        businessId: reminder.businessId,
      },
      select: {
        phone: true,
      },
    });

    if (!lead?.phone) {
      await prisma.appointmentReminderLedger.update({
        where: {
          id: reminder.id,
        },
        data: {
          status: "SKIPPED",
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(reminder.metadata), {
            skippedReason: "phone_missing",
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        sent: false,
        skipped: true,
        reason: "phone_missing",
      };
    }

    const consent = await resolveConsentAuthority({
      businessId: reminder.businessId,
      leadId: reminder.leadId,
      channel: reminder.channel,
      scope: reminder.consentScope,
    });

    if (consent.status !== "GRANTED") {
      await prisma.appointmentReminderLedger.update({
        where: {
          id: reminder.id,
        },
        data: {
          status: "SUPPRESSED",
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(reminder.metadata), {
            suppressedReason: "consent_not_granted",
            consentStatus: consent.status,
            consentRecordId: consent.recordId,
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        sent: false,
        skipped: true,
        reason: "consent_not_granted",
      };
    }

    const phoneDigits = String(lead.phone || "").replace(/\D/g, "");
    const finalPhone = phoneDigits.startsWith("91") ? phoneDigits : `91${phoneDigits}`;
    const message = buildReminderMessage({
      reminderType: reminder.reminderType,
      appointment,
    });
    const sent = await sendWhatsAppMessage({
      to: finalPhone,
      message,
    });

    if (!sent) {
      throw new Error("reminder_delivery_failed");
    }

    await prisma.appointmentReminderLedger.update({
      where: {
        id: reminder.id,
      },
      data: {
        status: "SENT",
        sentAt: new Date(),
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(reminder.metadata), {
          consentStatus: consent.status,
          consentRecordId: consent.recordId,
        }) as Prisma.InputJsonValue,
      },
    });

    await appointmentEngineService
      .markReminderSent({
        businessId: reminder.businessId,
        appointmentKey: appointment.appointmentKey,
        reminderType: reminder.reminderType,
        channel: reminder.channel,
      })
      .catch(() => undefined);

    return {
      sent: true,
      skipped: false,
      reason: "delivered",
    };
  },
});

export const appointmentReminderService = createAppointmentReminderService();
