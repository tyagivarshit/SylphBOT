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
  req: any,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    const {
      dayOfWeek,
      startTime,
      endTime,
      slotDuration,
      bufferTime,
      timezone,
    } = req.body;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business not found in token",
      });
    }

    if (dayOfWeek === undefined || !startTime || !endTime) {
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
🔥 GET AVAILABILITY (FIXED FOR PARAM ROUTE)
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
        message: "businessId param required",
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