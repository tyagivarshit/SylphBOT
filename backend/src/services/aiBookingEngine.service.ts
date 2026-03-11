import prisma from "../config/prisma";
import { fetchAvailableSlots, createNewAppointment } from "./booking.service";
import { setConversationState, clearConversationState } from "./conversationState.service";

/*
AI BOOKING ENGINE
Handles booking intent and slot suggestions
*/

export const handleAIBookingIntent = async (
businessId: string,
leadId: string,
message: string
) => {
try {

/*
GET LEAD DETAILS
*/
const lead = await prisma.lead.findUnique({
where: { id: leadId },
});

if (!lead) {
return {
handled: false,
message: "Lead not found",
};
}

/*
GET NEXT 3 DAYS SLOTS
*/
const today = new Date();
const slotResults: Date[] = [];

for (let i = 0; i < 3; i++) {
const checkDate = new Date();
checkDate.setDate(today.getDate() + i);

const slots = await fetchAvailableSlots(businessId, checkDate);

if (slots.length) {
slotResults.push(...slots.slice(0, 3));
}
}

if (!slotResults.length) {
return {
handled: true,
message: "Sorry, no available booking slots right now.",
};
}

/*
STORE BOOKING STATE
*/
await setConversationState(
leadId,
"BOOKING_SELECTION",
JSON.stringify(slotResults)
);

/*
FORMAT SLOT MESSAGE
*/
const formattedSlots = slotResults.slice(0, 3).map((slot, index) => {
const date = slot.toLocaleDateString();
const time = slot.toLocaleTimeString([], {
hour: "2-digit",
minute: "2-digit",
});

return `${index + 1}. ${date} at ${time}`;
});

const replyMessage =
"Great! Here are some available slots:\n\n" +
formattedSlots.join("\n") +
"\n\nReply with the slot number you prefer.";

return {
handled: true,
slots: slotResults,
message: replyMessage,
};

} catch (error) {
console.error("AI BOOKING ENGINE ERROR:", error);

return {
handled: false,
message: "Failed to process booking request",
};

}
};

/*
CONFIRM BOOKING FROM SLOT SELECTION
*/
export const confirmAIBooking = async (
businessId: string,
leadId: string,
slot: Date
) => {
try {

const lead = await prisma.lead.findUnique({
where: { id: leadId },
});

if (!lead) {
throw new Error("Lead not found");
}

const startTime = new Date(slot);
const endTime = new Date(slot.getTime() + 30 * 60000);

const appointment = await createNewAppointment({
businessId,
leadId,
name: lead.name || "Customer",
email: lead.email || null,
phone: lead.phone || null,
startTime,
endTime,
});

/*
CLEAR STATE AFTER BOOKING
*/
await clearConversationState(leadId);

const date = startTime.toLocaleDateString();
const time = startTime.toLocaleTimeString([], {
hour: "2-digit",
minute: "2-digit",
});

const confirmationMessage =
"Your appointment is confirmed for " + date + " at " + time + ".";

return {
success: true,
appointment,
message: confirmationMessage,
};

} catch (error) {
console.error("AI BOOKING CONFIRM ERROR:", error);

return {
success: false,
message: "Failed to confirm appointment",
};

}
};
