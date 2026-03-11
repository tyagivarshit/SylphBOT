import { generateIntentReply } from "./aiIntentEngine.service";
import { handleAIBookingIntent, confirmAIBooking } from "./aiBookingEngine.service";
import { getConversationState, clearConversationState } from "./conversationState.service";

/*
AI ROUTER
Decides which AI system should handle the message
*/

interface RouterInput {
businessId: string;
leadId: string;
message: string;
}

export const routeAIMessage = async ({
businessId,
leadId,
message,
}: RouterInput) => {

try {

/* CHECK EXISTING CONVERSATION STATE */

const state = await getConversationState(leadId);

if (state?.state === "BOOKING_SELECTION") {

const slotIndex = parseInt(message);

if (!isNaN(slotIndex)) {

const slots = JSON.parse(state.context || "[]");

const selectedSlot = slots[slotIndex - 1];

if (selectedSlot) {

  const result = await confirmAIBooking(
    businessId,
    leadId,
    new Date(selectedSlot)
  );

  /* CLEAR STATE AFTER BOOKING */
  await clearConversationState(leadId);

  return result.message;

}

}

}

/* BOOKING KEYWORD CHECK */

const bookingKeywords = [
"book",
"appointment",
"call",
"meeting",
"schedule"
];

const lowerMessage = message.toLowerCase();

const isBooking = bookingKeywords.some((word) =>
lowerMessage.includes(word)
);

/* BOOKING FLOW */

if (isBooking) {

const result = await handleAIBookingIntent(
businessId,
leadId,
message
);

return result.message;

}

/* DEFAULT INTENT ENGINE */

const reply = await generateIntentReply({
businessId,
leadId,
message,
});

return reply;

} catch (error) {

console.error("AI ROUTER ERROR:", error);

return "AI failed to process message";

}

};
