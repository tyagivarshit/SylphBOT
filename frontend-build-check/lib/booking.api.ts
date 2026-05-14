import { apiFetch } from "@/lib/apiClient";

const requireData = <T>(data: T | null, fallback: string) => {
  if (data == null) {
    throw new Error(fallback);
  }

  return data;
};

export const getAvailableSlots = async (businessId: string, date: string) => {
  const response = await apiFetch<{ slots?: string[] }>(
    `/api/booking/slots/${businessId}?date=${encodeURIComponent(date)}`
  );

  if (!response.success) {
    throw new Error(response.message || "Failed to fetch slots");
  }

  return requireData(response.data, "Failed to fetch slots");
};

export const createAppointment = async (data: {
  businessId?: string;
  leadId?: string;
  name: string;
  email?: string;
  phone?: string;
  startTime: string;
  endTime: string;
}) => {
  const response = await apiFetch<{ appointment?: unknown }>("/api/booking/appointment", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.success) {
    throw new Error(response.message || "Failed to create appointment");
  }

  return requireData(response.data, "Failed to create appointment");
};

export const rescheduleAppointment = async (
  appointmentId: string,
  data: {
    startTime: string;
    endTime: string;
  }
) => {
  const response = await apiFetch<{ appointment?: unknown }>(
    `/api/booking/appointment/${appointmentId}/reschedule`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );

  if (!response.success) {
    throw new Error(response.message || "Failed to reschedule appointment");
  }

  return requireData(response.data, "Failed to reschedule appointment");
};

export const cancelAppointment = async (appointmentId: string) => {
  const response = await apiFetch<{ appointment?: unknown }>(
    `/api/booking/appointment/${appointmentId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.success) {
    throw new Error(response.message || "Failed to cancel appointment");
  }

  return requireData(response.data, "Failed to cancel appointment");
};
