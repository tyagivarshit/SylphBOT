export const generateSmartFallback = (message: string) => {

  const msg = message.toLowerCase();

  if (msg.includes("price") || msg.includes("cost")) {
    return "Pricing depends on your needs 🙂\n\nI can suggest the best plan for you.\nAre you looking for basic features or advanced automation?";
  }

  if (msg.includes("service") || msg.includes("what do you do")) {
    return "We offer automation solutions to help grow your business 🚀\n\nDo you want help with leads, bookings, or engagement?";
  }

  if (msg.includes("help")) {
    return "Sure 🙂 tell me what you're trying to achieve and I'll guide you step by step.";
  }

  /* default */
  return "I can help you with that 🙂\n\nCan you tell me a bit more so I can guide you better?";
};