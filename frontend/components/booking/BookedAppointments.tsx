"use client";

import { useEffect, useState } from "react";
import { cancelAppointment } from "@/lib/booking.api";
import { api } from "@/lib/api";
import useAuthGuard from "@/hooks/useAuthGuard";
import { useAuth } from "@/context/AuthContext";

interface Booking {
  id: string;
  name: string;
  startTime: string;
  status: string;
}

export default function BookedAppointments({
  refreshKey,
}: {
  refreshKey?: number;
}) {

  /* ============================= */
  /* AUTH */
  /* ============================= */

  const authLoading = useAuthGuard();
  const { user } = useAuth();

  const businessId = user?.businessId; // ✅ FIXED

  /* ============================= */
  /* STATE */
  /* ============================= */

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  /* ============================= */
  /* FETCH BOOKINGS */
  /* ============================= */

  const fetchBookings = async () => {
    if (!businessId) return;

    try {
      setLoading(true);

      const res = await api.get(`/booking/list/${businessId}`);

      setBookings(res.data.bookings || []);
    } catch (err) {
      console.error("FETCH BOOKINGS ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!businessId) return;
    fetchBookings();
  }, [businessId, refreshKey]);

  /* ============================= */
  /* CANCEL BOOKING */
  /* ============================= */

  const handleCancel = async (id: string) => {
    try {
      await cancelAppointment(id);
      fetchBookings();
    } catch (err) {
      console.error("CANCEL ERROR:", err);
    }
  };

  /* ============================= */
  /* FORMAT DATE */
  /* ============================= */

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);

    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  /* ============================= */
  /* STATUS COLOR */
  /* ============================= */

  const getStatusColor = (status: string) => {
    switch (status) {
      case "BOOKED":
        return "text-green-600";
      case "CANCELLED":
        return "text-red-500";
      case "RESCHEDULED":
        return "text-yellow-600";
      default:
        return "text-gray-500";
    }
  };

  /* ============================= */
  /* AUTH LOADING */
  /* ============================= */

  if (authLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-500">Checking authentication...</p>
      </div>
    );
  }

  /* ============================= */
  /* UI */
  /* ============================= */

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">

      <h2 className="text-sm font-semibold text-gray-900 mb-4">
        Booked Appointments
      </h2>

      {!businessId ? (
        <p className="text-sm text-gray-500">Loading business...</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500">No bookings yet</p>
      ) : (
        <div className="space-y-3">

          {bookings.map((b) => (
            <div
              key={b.id}
              className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center"
            >

              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {b.name}
                </p>

                <p className="text-xs text-gray-600">
                  {formatDateTime(b.startTime)}
                </p>

                <p
                  className={`text-xs font-semibold ${getStatusColor(
                    b.status
                  )}`}
                >
                  {b.status}
                </p>
              </div>

              {b.status === "BOOKED" && (
                <button
                  onClick={() => handleCancel(b.id)}
                  className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg"
                >
                  Cancel
                </button>
              )}

            </div>
          ))}

        </div>
      )}

    </div>
  );
}