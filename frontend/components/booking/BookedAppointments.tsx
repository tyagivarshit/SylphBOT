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

      // 🔥 FILTER LOGIC
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

  if (authLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-[#e6e6e2] border-t-[#0f172a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">

      {/* LIST */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-[#e6e6e2] border-t-[#0f172a] rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="text-[13px] text-[#6b7280] text-center py-6 font-medium">
            No bookings found
          </p>
        ) : (
          bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onClick={() => setSelected(b)}
            />
          ))
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