import toast, { type ToastOptions } from "react-hot-toast";

type ToastTone = "success" | "error" | "warning";

const DEDUPE_WINDOW_MS = 2500;
const recentToasts = new Map<string, number>();

const baseStyle = {
  borderRadius: "18px",
  fontSize: "14px",
  padding: "12px 16px",
  boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
  backdropFilter: "blur(16px)",
} satisfies NonNullable<ToastOptions["style"]>;

const toneStyle: Record<ToastTone, NonNullable<ToastOptions["style"]>> = {
  success: {
    background: "rgba(236, 253, 245, 0.96)",
    color: "#166534",
    border: "1px solid rgba(110, 231, 183, 0.9)",
  },
  error: {
    background: "rgba(254, 242, 242, 0.96)",
    color: "#991b1b",
    border: "1px solid rgba(252, 165, 165, 0.92)",
  },
  warning: {
    background: "rgba(255, 251, 235, 0.97)",
    color: "#92400e",
    border: "1px solid rgba(252, 211, 77, 0.92)",
  },
};

const buildToastId = (tone: ToastTone, message: string) =>
  `automexia:${tone}:${message.trim().toLowerCase()}`;

const shouldShowToast = (id: string) => {
  const now = Date.now();
  const previousShownAt = recentToasts.get(id) ?? 0;

  if (now - previousShownAt < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentToasts.set(id, now);
  return true;
};

const showToast = (
  tone: ToastTone,
  message: string,
  options?: ToastOptions
) => {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return "";
  }

  const id = options?.id ?? buildToastId(tone, trimmedMessage);

  if (!shouldShowToast(String(id))) {
    return String(id);
  }

  return toast(trimmedMessage, {
    ...options,
    id,
    duration: tone === "warning" ? 4200 : 3600,
    icon:
      tone === "warning"
        ? options?.icon ?? "!"
        : options?.icon,
    style: {
      ...baseStyle,
      ...toneStyle[tone],
      ...(options?.style ?? {}),
    },
    iconTheme:
      tone === "success"
        ? {
            primary: "#16a34a",
            secondary: "#f0fdf4",
          }
        : tone === "error"
          ? {
              primary: "#dc2626",
              secondary: "#ffffff",
            }
          : options?.iconTheme,
  });
};

export const showSuccessToast = (message: string, options?: ToastOptions) =>
  showToast("success", message, options);

export const showErrorToast = (message: string, options?: ToastOptions) =>
  showToast("error", message, options);

export const showWarningToast = (message: string, options?: ToastOptions) =>
  showToast("warning", message, options);

export const notify = {
  success: showSuccessToast,
  error: showErrorToast,
  warning: showWarningToast,
};

export const getErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};
