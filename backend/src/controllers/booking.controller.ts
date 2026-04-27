import { Request, Response } from "express";
import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
  cancelExistingAppointment,
  rescheduleAppointment,
} from "../services/booking.service";

type AuthenticatedRequest = Request & {
  user?: {
    businessId?: string | null;
  };
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
    console.error("GET SLOTS ERROR:", error);

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

    if (!businessId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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
    console.error("CREATE APPOINTMENT ERROR:", error);

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

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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
    console.error("RESCHEDULE ERROR:", error);

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
    console.error("CANCEL APPOINTMENT ERROR:", error);

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

    const bookings = await prisma.appointment.findMany({
      where: { businessId },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        name: true,
        startTime: true,
        status: true,
      },
    });

    const formattedBookings = bookings.map((booking) => ({
      id: booking.id,
      name: booking.name,
      startTime: booking.startTime.toISOString(),
      status: booking.status,
    }));

    return res.status(200).json({
      success: true,
      data: {
        bookings: formattedBookings,
      },
    });
  } catch (error: any) {
    console.error("GET BOOKINGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
};
