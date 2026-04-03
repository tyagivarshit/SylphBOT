"use client";

import { useEffect, useState } from "react";
import {
  getAvailableSlots,
  createAppointment,
} from "@/lib/booking.api";

export default function BookingCalendarPage() {
  const [date, setDate] = useState<string>("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const businessId = "YOUR_BUSINESS_ID"; // TODO: replace from auth/user

  /* =====================================================
  FETCH SLOTS
  ===================================================== */
  const fetchSlots = async () => {
    if (!date) return;

    try {
      setLoading(true);

      const res = await getAvailableSlots(businessId, date);

      const formatted = res.slots.map((s: string) =>
        new Date(s).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );

      setSlots(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [date]);

  /* =====================================================
  BOOK SLOT
  ===================================================== */
  const handleBooking = async () => {
    if (!selectedSlot || !date) return;

    try {
      const start = new Date(`${date} ${selectedSlot}`);
      const end = new Date(start.getTime() + 30 * 60000);

      await createAppointment({
        businessId,
        name: "Test User",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      alert("✅ Booking Confirmed");

      setSelectedSlot(null);
      fetchSlots();
    } catch (err) {
      console.error(err);
      alert("❌ Failed to book");
    }
  };

  return (
    <div className="p-6 bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-100 shadow-sm space-y-5 max-w-xl">

      <h1 className="text-lg font-semibold text-gray-900">
        Booking Calendar
      </h1>

      {/* DATE PICKER */}
      <input
        type="date"
        className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      {/* SLOTS */}
      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse">
          Loading slots...
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {slots.map((slot, i) => (
            <button
              key={i}
              onClick={() => setSelectedSlot(slot)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                selectedSlot === slot
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-transparent shadow-md"
                  : "bg-white/70 border-blue-100 text-gray-700 hover:bg-blue-50"
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      )}

      {/* BOOK BUTTON */}
      <button
        onClick={handleBooking}
        disabled={!selectedSlot}
        className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-60"
      >
        Confirm Booking
      </button>

    </div>
  );
}