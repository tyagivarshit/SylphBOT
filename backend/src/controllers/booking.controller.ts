import { Request, Response } from "express";
import {
fetchAvailableSlots,
createNewAppointment,
cancelExistingAppointment,
} from "../services/booking.service";

/*
GET AVAILABLE SLOTS
*/
export const getAvailableSlots = async (req: Request, res: Response) => {
try {
const businessId = req.params.businessId as string;
const date = req.query.date as string;

if (!date) {
  return res.status(400).json({
    success: false,
    message: "Date is required",
  });
}

const slots = await fetchAvailableSlots(
  businessId,
  new Date(date)
);

return res.status(200).json({
  success: true,
  slots,
});

} catch (error) {
console.error("GET SLOTS ERROR:", error);

return res.status(500).json({
  success: false,
  message: "Failed to fetch slots",
});

}
};

/*
CREATE APPOINTMENT
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

const appointment = await createNewAppointment({
  businessId,
  leadId,
  name,
  email,
  phone,
  startTime,
  endTime,
});

return res.status(201).json({
  success: true,
  appointment,
});

} catch (error) {
console.error("CREATE APPOINTMENT ERROR:", error);


return res.status(500).json({
  success: false,
  message: "Failed to create appointment",
});


}
};

/*
CANCEL APPOINTMENT
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

} catch (error) {
console.error("CANCEL APPOINTMENT ERROR:", error);

return res.status(500).json({
  success: false,
  message: "Failed to cancel appointment",
});

}
};
