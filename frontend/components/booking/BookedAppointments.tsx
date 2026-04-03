"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import useAuthGuard from "@/hooks/useAuthGuard";
import BookingCard from "./BookingCard";
import BookingDrawer from "./BookingDrawer";

interface Booking {
  id: string;
  name: string;
  startTime: string;
  status: string;
}

export default function BookedAppointments({
  filter,
}: {
  filter?: string;
}) {
  const { loading: authLoading } = useAuthGuard();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);

  const fetchBookings = async () => {
    try {
      setLoading(true);

      const res = await api.get("/api/booking/list");

      let data = res.data.bookings || [];

      if (filter === "UPCOMING") {
        data = data.filter((b: Booking) => b.status === "BOOKED");
      } else if (filter === "CANCELLED") {
        data = data.filter((b: Booking) => b.status === "CANCELLED");
      } else if (filter === "RESCHEDULED") {
        data = data.filter((b: Booking) => b.status === "RESCHEDULED");
      }

      setBookings(data);
    } catch (err) {
      console.error("FETCH BOOKINGS ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchBookings();
  }, [authLoading, filter]);

  /* 🔥 AUTH LOADING */
  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="w-7 h-7 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">

      {/* 🔥 LIST */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">

        {loading ? (
          <div className="flex justify-center items-center py-10">
            <div className="w-7 h-7 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-10 px-6 border border-dashed border-blue-200 rounded-2xl bg-white/80 backdrop-blur-xl shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              No bookings found
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Your appointments will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl bg-white/70 backdrop-blur-xl border border-blue-100 shadow-sm hover:shadow-md transition-all"
              >
                <BookingCard
                  booking={b}
                  onClick={() => setSelected(b)}
                />
              </div>
            ))}
          </div>
        )}

      </div>

      {/* 🔥 DRAWER */}
      <BookingDrawer
        open={!!selected}
        data={selected}
        onClose={() => setSelected(null)}
        onRefresh={fetchBookings}
      />

    </div>
  );
}