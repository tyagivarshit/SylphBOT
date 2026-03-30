import {
  getConversationState,
  clearConversationState,
  setConversationState,
} from "./conversationState.service";

/* 🔥 SLOT LOCK */
import {
  acquireSlotLock,
  releaseSlotLock, // 🔥 NEW
} from "./slotLock.service";

/*
=====================================================
SLOT SELECTION HANDLER (FINAL + SAFE LOCK SYSTEM)
=====================================================
*/

export const handleSlotSelection = async ({
  leadId,
  businessId,
  message,
}: {
  leadId: string;
  businessId: string;
  message: string;
}) => {
  try {
    /* ---------------- GET STATE ---------------- */
    const state = await getConversationState(leadId);

    if (!state || state.state !== "BOOKING_SELECTION") {
      return null;
    }

    /* ---------------- PARSE SLOTS ---------------- */
    let slots: string[] = [];

    try {
      slots =
        typeof state.context === "string"
          ? JSON.parse(state.context)
          : [];
    } catch {
      await clearConversationState(leadId);
      return "Something went wrong. Please try booking again.";
    }

    if (!slots.length) {
      await clearConversationState(leadId);
      return "No slots available anymore.";
    }

    /* ---------------- USER CHANGE HANDLING 🔥 ---------------- */
    const clean = message.toLowerCase();

    if (clean.includes("change")) {
      // 🔥 release previous lock if exists
      if (state.context) {
        await releaseSlotLock(state.context);
      }

      await clearConversationState(leadId);

      return "No problem 👍 Please choose another slot.";
    }

    /* ---------------- SMART PARSING ---------------- */
    let index: number | null = null;

    const numeric = parseInt(clean.replace(/\D/g, ""));
    if (!isNaN(numeric)) index = numeric - 1;

    if (clean.includes("first")) index = 0;
    if (clean.includes("second")) index = 1;
    if (clean.includes("third")) index = 2;
    if (clean.includes("last")) index = slots.length - 1;

    if (index === null || index < 0 || index >= slots.length) {
      return `Please select a valid option (1-${slots.length}).`;
    }

    const selectedSlot = new Date(slots[index]);

    /* ---------------- VALIDATION ---------------- */
    if (isNaN(selectedSlot.getTime())) {
      await clearConversationState(leadId);
      return "Invalid slot selected. Please try again.";
    }

    if (selectedSlot.getTime() <= Date.now()) {
      return "That slot is no longer available.";
    }

    /* =====================================================
    🔒 SLOT LOCK (WITH SAFETY)
    ===================================================== */
    const locked = await acquireSlotLock(
      selectedSlot.toISOString(),
      leadId
    );

    if (!locked) {
      return "⚠️ This slot was just booked by someone else. Please choose another one.";
    }

    /* =====================================================
    🔥 MOVE TO CONFIRMATION STATE
    ===================================================== */
    await setConversationState(
      leadId,
      "BOOKING_CONFIRMATION",
      selectedSlot.toISOString(),
      15
    );

    /* ---------------- RESPONSE ---------------- */
    return `Great choice 👍

📅 ${selectedSlot.toLocaleString()}

Just reply "YES" to confirm your booking  
or "CHANGE" to pick another slot.`;

  } catch (error) {
    console.error("SLOT SELECTION ERROR:", error);
    return "Failed to process your selection. Please try again.";
  }
};