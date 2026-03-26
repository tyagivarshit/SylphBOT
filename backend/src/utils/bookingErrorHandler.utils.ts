export const getBookingErrorMessage = (error: any): string => {
  try {
    const msg =
      typeof error?.message === "string"
        ? error.message.toLowerCase()
        : "";

    /* =====================================================
       KNOWN ERRORS
    ===================================================== */

    if (msg.includes("slot already booked")) {
      return "⚠️ That slot was just booked. Please choose another one.";
    }

    if (msg.includes("no slots available")) {
      return "No slots available for the selected time.";
    }

    if (msg.includes("not available")) {
      return "That slot is no longer available.";
    }

    if (msg.includes("invalid date")) {
      return "Please provide a valid date.";
    }

    if (msg.includes("lead not found")) {
      return "We couldn't find your details. Please try again.";
    }

    if (msg.includes("appointment not found")) {
      return "Booking not found.";
    }

    if (msg.includes("conflict")) {
      return "This time is already booked. Please choose another slot.";
    }

    /* =====================================================
       NETWORK / UNKNOWN
    ===================================================== */

    if (error?.code === "ECONNREFUSED") {
      return "Server is temporarily unavailable. Please try again later.";
    }

    if (error?.response?.status === 429) {
      return "Too many requests. Please try again shortly.";
    }

    if (error?.response?.status === 500) {
      return "Server error occurred. Please try again.";
    }

    /* =====================================================
       FALLBACK
    ===================================================== */

    return "Something went wrong while processing your booking. Please try again.";

  } catch {
    return "Unexpected error occurred. Please try again.";
  }
};