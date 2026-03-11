import prisma from "../config/prisma";

/*
FETCH AVAILABLE SLOTS
*/
export const fetchAvailableSlots = async (
businessId: string,
date: Date
) => {
const dayOfWeek = date.getDay();

/*
BUSINESS SLOT CONFIG
*/
const slots = await prisma.bookingSlot.findMany({
where: {
businessId,
dayOfWeek,
isActive: true,
},
});

if (!slots.length) return [];

/*
EXISTING APPOINTMENTS
*/
const startOfDay = new Date(date);
startOfDay.setHours(0, 0, 0, 0);

const endOfDay = new Date(date);
endOfDay.setHours(23, 59, 59, 999);

const appointments = await prisma.appointment.findMany({
where: {
businessId,
startTime: {
gte: startOfDay,
lte: endOfDay,
},
status: "BOOKED",
},
});

const bookedTimes = appointments.map((a) =>
a.startTime.toISOString()
);

/*
GENERATE SLOT LIST
*/
const availableSlots: Date[] = [];

for (const slot of slots) {
const [startHour, startMinute] = slot.startTime.split(":").map(Number);
const [endHour, endMinute] = slot.endTime.split(":").map(Number);

let current = new Date(date);
current.setHours(startHour, startMinute, 0, 0);

const end = new Date(date);
end.setHours(endHour, endMinute, 0, 0);

while (current < end) {
  const exists = bookedTimes.includes(current.toISOString());

  if (!exists) {
    availableSlots.push(new Date(current));
  }

  current = new Date(current.getTime() + 30 * 60000);
}

}

return availableSlots;
};

/*
CREATE APPOINTMENT
*/
export const createNewAppointment = async (data: any) => {
const {
businessId,
leadId,
name,
email,
phone,
startTime,
endTime,
} = data;

const appointment = await prisma.appointment.create({
data: {
businessId,
leadId,
name,
email,
phone,
startTime: new Date(startTime),
endTime: new Date(endTime),
status: "BOOKED",
},
});

/*
UPDATE LEAD STAGE
*/
if (leadId) {
await prisma.lead.update({
where: { id: leadId },
data: {
stage: "BOOKED_CALL",
},
});
}

return appointment;
};

/*
CANCEL APPOINTMENT
*/
export const cancelExistingAppointment = async (
appointmentId: string
) => {
return prisma.appointment.update({
where: { id: appointmentId },
data: {
status: "CANCELLED",
},
});
};
