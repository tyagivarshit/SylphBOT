"use client";

import { useEffect, useState } from "react";
import { cancelAppointment } from "@/lib/booking.api";
import { api } from "@/lib/api";
import useAuthGuard from "@/hooks/useAuthGuard";

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
  const { loading: authLoading } = useAuthGuard(); // 🔥 FIX

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBookings = async () => {
    try {
      console.log("🔥 FETCH BOOKINGS CALLED"); // DEBUG

      setLoading(true);

      const res = await api.get("/api/booking/list");

      console.log("BOOKINGS API:", res.data);

      setBookings(res.data.bookings || []);
    } catch (err) {
      console.error("FETCH BOOKINGS ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    fetchBookings();
  }, [authLoading, refreshKey]);

  const handleCancel = async (id: string) => {
    try {
      await cancelAppointment(id);
      fetchBookings();
    } catch (err) {
      console.error(err);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);

    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "BOOKED":
        return "bg-green-100 text-green-600";
      case "CANCELLED":
        return "bg-red-100 text-red-600";
      case "RESCHEDULED":
        return "bg-yellow-100 text-yellow-600";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No bookings yet
          </p>
        ) : (
          bookings.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <p className="text-sm font-semibold">{b.name}</p>
                <p className="text-xs text-gray-600">
                  {formatDateTime(b.startTime)}
                </p>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${getStatusStyles(
                    b.status
                  )}`}
                >
                  {b.status}
                </span>
              </div>

              {b.status === "BOOKED" && (
                <button
                  onClick={() => handleCancel(b.id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white"
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}

      </div>
    </div>
  );
}