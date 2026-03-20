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
    <div className="p-6 bg-white rounded-xl border border-gray-200">
      <h1 className="text-lg font-semibold mb-4">
        Booking Calendar
      </h1>

      {/* DATE PICKER */}
      <input
        type="date"
        className="border px-3 py-2 rounded-lg mb-4"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      {/* SLOTS */}
      {loading ? (
        <p>Loading slots...</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {slots.map((slot, i) => (
            <button
              key={i}
              onClick={() => setSelectedSlot(slot)}
              className={`border px-3 py-2 rounded-lg text-sm ${
                selectedSlot === slot
                  ? "bg-blue-600 text-white"
                  : "bg-white"
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
        className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        Confirm Booking
      </button>
    </div>
  );
}