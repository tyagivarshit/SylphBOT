import { Request, Response } from "express";
import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
  cancelExistingAppointment,
  rescheduleAppointment,
} from "../services/booking.service";
import { appointmentEngineService } from "../services/appointmentEngine.service";
import { createMeetingStateService } from "../services/meetingState.service";
import { rescheduleEngineService } from "../services/rescheduleEngine.service";
import { waitlistEngineService } from "../services/waitlistEngine.service";
import { appointmentProjectionService } from "../services/appointmentProjection.service";
import { appointmentOutcomeService } from "../services/appointmentOutcome.service";
import { meetingArtifactService } from "../services/meetingArtifact.service";
import { enqueueCalendarSyncWebhookJob } from "../queues/calendarSync.queue";

type AuthenticatedRequest = Request & {
  user?: {
    businessId?: string | null;
  };
};

const meetingState = createMeetingStateService();

const parseDate = (input: unknown) => {
  const parsed = new Date(String(input || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getAvailableSlots = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const requestedBusinessId = req.params.businessId as string;
    const businessId = req.user?.businessId || null;
    const date = req.query.date as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!requestedBusinessId || !date) {
      return res.status(400).json({
        success: false,
        message: "Business ID and date are required",
      });
    }

    if (requestedBusinessId !== businessId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    const slots = await fetchAvailableSlots(businessId, parsedDate);

    return res.status(200).json({
      success: true,
      data: {
        slots,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch slots",
    });
  }
};

export const createAppointment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const { leadId, name, email, phone, startTime, endTime } = req.body;

    if (!businessId || !startTime || !endTime || !leadId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = parseDate(startTime);
    const end = parseDate(endTime);

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time",
      });
    }

    const appointment = await createNewAppointment({
      businessId,
      leadId,
      name,
      email,
      phone,
      startTime: start,
      endTime: end,
    });

    return res.status(201).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create appointment",
    });
  }
};

export const rescheduleAppointmentController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentId = req.params.appointmentId as string;
    const { startTime, endTime } = req.body;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!appointmentId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = parseDate(startTime);
    const end = parseDate(endTime);

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time",
      });
    }

    const appointment = await rescheduleAppointment(
      businessId,
      appointmentId,
      start,
      end
    );

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    const statusCode =
      error?.message === "Appointment not found"
        ? 404
        : error?.message === "New slot not available"
        ? 409
        : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to reschedule",
    });
  }
};

export const cancelAppointment = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentId = req.params.appointmentId as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID required",
      });
    }

    const appointment = await cancelExistingAppointment(businessId, appointmentId);

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(error?.message === "Appointment not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to cancel appointment",
    });
  }
};

export const listAppointments = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID missing",
      });
    }

    const bookings = await prisma.appointmentLedger.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        appointmentKey: true,
        startAt: true,
        endAt: true,
        status: true,
        meetingType: true,
      },
      take: 100,
    });

    return res.status(200).json({
      success: true,
      data: {
        bookings,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
};

export const requestAppointmentController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      leadId,
      meetingType = "GENERAL",
      purpose = null,
      priority = "MEDIUM",
      timezone = "UTC",
      requestedWindow = null,
      durationMinutes = null,
      source = "SELF_SERVE",
      bookedBy = "SELF",
      locationType = "VIRTUAL",
      locationDetails = null,
      notes = null,
      assignedHumanId = null,
      assignedTeam = null,
      interactionId = null,
      metadata = null,
      traceId = null,
    } = req.body || {};

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId is required",
      });
    }

    const appointment = await appointmentEngineService.requestAppointment({
      businessId,
      leadId,
      meetingType,
      purpose,
      priority,
      timezone,
      requestedWindow,
      durationMinutes,
      source,
      bookedBy,
      locationType,
      locationDetails,
      notes,
      assignedHumanId,
      assignedTeam,
      interactionId,
      metadata,
      traceId,
    });

    return res.status(201).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to request appointment",
    });
  }
};

export const holdAppointmentSlotController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();
    const { slotKey, holdTtlMinutes = 10, heldBy = "SELF" } = req.body || {};

    if (!businessId || !appointmentKey || !slotKey) {
      return res.status(400).json({
        success: false,
        message: "business, appointmentKey, and slotKey are required",
      });
    }

    const held = await appointmentEngineService.holdSlot({
      businessId,
      appointmentKey,
      slotKey,
      holdTtlMinutes: Number(holdTtlMinutes || 10),
      heldBy,
    });

    return res.status(200).json({
      success: true,
      data: held,
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to hold slot",
    });
  }
};

export const confirmAppointmentSlotController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();
    const { holdToken = null, confirmedBy = "SELF" } = req.body || {};

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const appointment = await appointmentEngineService.confirmSlot({
      businessId,
      appointmentKey,
      holdToken,
      confirmedBy,
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to confirm appointment",
    });
  }
};

export const rescheduleCanonicalAppointmentController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();
    const { newSlotKey, actor = "SELF", reason = "rescheduled_via_api" } = req.body || {};

    if (!businessId || !appointmentKey || !newSlotKey) {
      return res.status(400).json({
        success: false,
        message: "business, appointmentKey, and newSlotKey are required",
      });
    }

    const appointment = await rescheduleEngineService.reschedule({
      businessId,
      appointmentKey,
      newSlotKey,
      actor,
      reason,
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to reschedule appointment",
    });
  }
};

export const cancelCanonicalAppointmentController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();
    const { reason = "cancelled_via_api", actor = "SELF" } = req.body || {};

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const appointment = await appointmentEngineService.cancelAppointment({
      businessId,
      appointmentKey,
      reason,
      actor,
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to cancel appointment",
    });
  }
};

export const checkInAppointmentController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const appointment = await meetingState.transition({
      businessId,
      appointmentKey,
      nextState: "CHECKED_IN",
      reason: "manual_check_in",
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to check in",
    });
  }
};

export const runningLateController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const appointment = await meetingState.transition({
      businessId,
      appointmentKey,
      nextState: "LATE_JOIN",
      reason: "running_late_signal",
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to mark running late",
    });
  }
};

export const addWaitlistRequestController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const {
      leadId,
      meetingType = "GENERAL",
      slotId = null,
      appointmentId = null,
      priorityScore = 0,
      reason = null,
      metadata = null,
    } = req.body || {};

    if (!businessId || !leadId) {
      return res.status(400).json({
        success: false,
        message: "business and leadId are required",
      });
    }

    const waitlist = await waitlistEngineService.addRequest({
      businessId,
      leadId,
      meetingType,
      slotId,
      appointmentId,
      priorityScore,
      reason,
      metadata,
    });

    return res.status(201).json({
      success: true,
      data: {
        waitlist,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add waitlist request",
    });
  }
};

export const getAppointmentOpsProjectionController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const from = parseDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = parseDate(req.query.to) || new Date();

    const projection = await appointmentProjectionService.getOpsProjection({
      businessId,
      from,
      to,
    });

    return res.status(200).json({
      success: true,
      data: projection,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load appointment projection",
    });
  }
};

export const recordAppointmentOutcomeController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();
    const { outcome = "COMPLETED", feedbackScore = null, notes = null, metadata = null } =
      req.body || {};

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const appointment = await appointmentOutcomeService.complete({
      businessId,
      appointmentKey,
      outcome,
      feedbackScore,
      notes,
      metadata,
    });

    return res.status(200).json({
      success: true,
      data: {
        appointment,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to record appointment outcome",
    });
  }
};

export const upsertMeetingArtifactsController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;
    const appointmentKey = String(req.params.appointmentKey || "").trim();

    if (!businessId || !appointmentKey) {
      return res.status(400).json({
        success: false,
        message: "business and appointmentKey are required",
      });
    }

    const {
      recordingRef = null,
      transcriptRef = null,
      notesRef = null,
      summaryRef = null,
      actionItems = null,
      nextStepRef = null,
      metadata = null,
    } = req.body || {};

    const artifact = await meetingArtifactService.upsertArtifacts({
      businessId,
      appointmentKey,
      recordingRef,
      transcriptRef,
      notesRef,
      summaryRef,
      actionItems,
      nextStepRef,
      metadata,
    });

    return res.status(200).json({
      success: true,
      data: {
        artifact,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to persist meeting artifacts",
    });
  }
};

export const replayCalendarSyncWebhookController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId || null;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      provider,
      externalEventId,
      dedupeFingerprint,
      externalUpdatedAtIso,
      cancelled = false,
      startAtIso = null,
      endAtIso = null,
      metadata = null,
    } = req.body || {};

    if (!provider || !externalEventId || !dedupeFingerprint || !externalUpdatedAtIso) {
      return res.status(400).json({
        success: false,
        message:
          "provider, externalEventId, dedupeFingerprint and externalUpdatedAtIso are required",
      });
    }

    await enqueueCalendarSyncWebhookJob({
      businessId,
      provider,
      externalEventId,
      dedupeFingerprint,
      externalUpdatedAtIso,
      externalEventVersion: String(req.body?.externalEventVersion || "").trim() || null,
      cancelled,
      startAtIso,
      endAtIso,
      metadata,
    });

    return res.status(202).json({
      success: true,
      data: {
        queued: true,
      },
    });
  } catch (error: any) {
    return res.status(409).json({
      success: false,
      message: error.message || "Failed to replay calendar webhook",
    });
  }
};
