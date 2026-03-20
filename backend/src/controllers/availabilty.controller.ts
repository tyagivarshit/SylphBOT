import { Request, Response } from "express";
import {
  createAvailability,
  getAvailability,
  updateAvailability,
  deleteAvailability,
} from "../models/availability.model";

/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
export const createAvailabilityController = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      businessId,
      dayOfWeek,
      startTime,
      endTime,
      slotDuration,
      bufferTime,
      timezone,
    } = req.body;

    /* VALIDATION */
    if (!businessId || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time",
      });
    }

    const availability = await createAvailability({
      businessId,
      dayOfWeek,
      startTime,
      endTime,
      slotDuration,
      bufferTime,
      timezone,
    });

    return res.status(201).json({
      success: true,
      availability,
    });
  } catch (error: any) {
    console.error("CREATE AVAILABILITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create availability",
    });
  }
};

/*
=====================================================
GET AVAILABILITY
=====================================================
*/
export const getAvailabilityController = async (
  req: Request,
  res: Response
) => {
  try {
    const businessId = req.params.businessId as string;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required",
      });
    }

    const availability = await getAvailability(businessId);

    return res.status(200).json({
      success: true,
      availability,
    });
  } catch (error: any) {
    console.error("GET AVAILABILITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch availability",
    });
  }
};

/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
export const updateAvailabilityController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = req.params.id as string;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Availability ID required",
      });
    }

    if (req.body.startTime && req.body.endTime) {
      if (req.body.startTime >= req.body.endTime) {
        return res.status(400).json({
          success: false,
          message: "Start time must be before end time",
        });
      }
    }

    const availability = await updateAvailability(id, req.body);

    return res.status(200).json({
      success: true,
      availability,
    });
  } catch (error: any) {
    console.error("UPDATE AVAILABILITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update availability",
    });
  }
};

/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
export const deleteAvailabilityController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = req.params.id as string;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Availability ID required",
      });
    }

    await deleteAvailability(id);

    return res.status(200).json({
      success: true,
      message: "Availability deleted",
    });
  } catch (error: any) {
    console.error("DELETE AVAILABILITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete availability",
    });
  }
};