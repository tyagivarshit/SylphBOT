import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import crypto from "crypto";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";

const buildArtifactFingerprint = (input: Record<string, unknown>) =>
  crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");

export const createMeetingArtifactService = () => ({
  upsertArtifacts: async ({
    businessId,
    appointmentKey,
    recordingRef = null,
    transcriptRef = null,
    notesRef = null,
    summaryRef = null,
    actionItems = null,
    nextStepRef = null,
    metadata = null,
  }: {
    businessId: string;
    appointmentKey: string;
    recordingRef?: string | null;
    transcriptRef?: string | null;
    notesRef?: string | null;
    summaryRef?: string | null;
    actionItems?: Record<string, unknown> | null;
    nextStepRef?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
    });

    if (!appointment) {
      throw new Error("appointment_not_found");
    }

    const fingerprint = buildArtifactFingerprint({
      recordingRef,
      transcriptRef,
      notesRef,
      summaryRef,
      actionItems,
      nextStepRef,
    });
    const existing = await prisma.meetingArtifactLedger.findUnique({
      where: {
        appointmentId: appointment.id,
      },
    });
    const existingFingerprint = String(
      parseAppointmentMetadata(existing?.metadata).fingerprint || ""
    ).trim();

    if (existing && existingFingerprint === fingerprint) {
      return existing;
    }

    const artifact = await prisma.meetingArtifactLedger.upsert({
      where: {
        appointmentId: appointment.id,
      },
      update: {
        recordingRef: recordingRef || undefined,
        transcriptRef: transcriptRef || undefined,
        notesRef: notesRef || undefined,
        summaryRef: summaryRef || undefined,
        actionItems: (actionItems || undefined) as Prisma.InputJsonValue,
        nextStepRef: nextStepRef || undefined,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(existing?.metadata), metadata || undefined, {
          fingerprint,
        }) as Prisma.InputJsonValue,
      },
      create: {
        businessId,
        appointmentId: appointment.id,
        recordingRef,
        transcriptRef,
        notesRef,
        summaryRef,
        actionItems: (actionItems || null) as Prisma.InputJsonValue,
        nextStepRef,
        metadata: mergeAppointmentMetadata(metadata || undefined, {
          fingerprint,
        }) as Prisma.InputJsonValue,
      },
    });

    await publishAppointmentEvent({
      event: "appointment.artifact_recorded",
      businessId,
      aggregateId: appointment.id,
      payload: {
        businessId,
        appointmentId: appointment.id,
        appointmentKey: appointment.appointmentKey,
        leadId: appointment.leadId,
        traceId: null,
        artifactTypes: [
          recordingRef ? "recording" : null,
          transcriptRef ? "transcript" : null,
          notesRef ? "notes" : null,
          summaryRef ? "summary" : null,
          actionItems ? "action_items" : null,
          nextStepRef ? "next_step" : null,
        ].filter(Boolean) as string[],
      },
      eventKey: `${appointment.appointmentKey}:artifact:${fingerprint}`,
    });

    return artifact;
  },

  getArtifacts: async ({
    businessId,
    appointmentKey,
  }: {
    businessId: string;
    appointmentKey: string;
  }) => {
    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
      select: {
        id: true,
      },
    });

    if (!appointment) {
      return null;
    }

    return prisma.meetingArtifactLedger.findUnique({
      where: {
        appointmentId: appointment.id,
      },
    });
  },
});

export const meetingArtifactService = createMeetingArtifactService();
