import { generateUnifiedFallback } from "./aiRuntime.service";

export const generateSmartFallback = (message: string) =>
  generateUnifiedFallback(message);
