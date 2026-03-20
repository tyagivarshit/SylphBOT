import axios from "axios";

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
export const getAvailableSlots = async (
  businessId: string,
  date: string
) => {
  const res = await API.get(`/booking/slots/${businessId}`, {
    params: { date },
  });
  return res.data;
};

/*
=====================================================
CREATE APPOINTMENT
=====================================================
*/
export const createAppointment = async (data: {
  businessId: string;
  leadId?: string;
  name: string;
  email?: string;
  phone?: string;
  startTime: string;
  endTime: string;
}) => {
  const res = await API.post(`/booking/appointment`, data);
  return res.data;
};

/*
=====================================================
RESCHEDULE APPOINTMENT
=====================================================
*/
export const rescheduleAppointment = async (
  appointmentId: string,
  data: {
    startTime: string;
    endTime: string;
  }
) => {
  const res = await API.put(
    `/booking/appointment/${appointmentId}/reschedule`,
    data
  );
  return res.data;
};

/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/
export const cancelAppointment = async (appointmentId: string) => {
  const res = await API.delete(
    `/booking/appointment/${appointmentId}`
  );
  return res.data;
};