import { Request, Response } from "express";
import {
  fetchAvailableSlots,
  createNewAppointment,
  cancelExistingAppointment,
  rescheduleAppointment,
} from "../services/booking.service";

/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
export const getAvailableSlots = async (req: Request, res: Response) => {
  try {
    const businessId = req.params.businessId as string;
    const date = req.query.date as string;

    if (!businessId || !date) {
      return res.status(400).json({
        success: false,
        message: "Business ID and date are required",
      });
    }

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    const slots = await fetchAvailableSlots(
      businessId,
      parsedDate
    );

    return res.status(200).json({
      success: true,
      slots,
    });
  } catch (error: any) {
    console.error("GET SLOTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch slots",
    });
  }
};

/*
=====================================================
CREATE APPOINTMENT
=====================================================
*/
export const createAppointment = async (req: Request, res: Response) => {
  try {
    const {
      businessId,
      leadId,
      name,
      email,
      phone,
      startTime,
      endTime,
    } = req.body;

    if (!businessId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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
      appointment,
    });
  } catch (error: any) {
    console.error("CREATE APPOINTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create appointment",
    });
  }
};

/*
=====================================================
RESCHEDULE APPOINTMENT
=====================================================
*/
export const rescheduleAppointmentController = async (
  req: Request,
  res: Response
) => {
  try {
    const appointmentId = req.params.appointmentId as string;
    const { startTime, endTime } = req.body;

    if (!appointmentId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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

    const updated = await rescheduleAppointment(
      appointmentId,
      start,
      end
    );

    return res.status(200).json({
      success: true,
      appointment: updated,
    });
  } catch (error: any) {
    console.error("RESCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reschedule",
    });
  }
};

/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/
export const cancelAppointment = async (req: Request, res: Response) => {
  try {
    const appointmentId = req.params.appointmentId as string;

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID required",
      });
    }

    const appointment = await cancelExistingAppointment(appointmentId);

    return res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error: any) {
    console.error("CANCEL APPOINTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel appointment",
    });
  }
};