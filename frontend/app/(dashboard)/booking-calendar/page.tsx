"use client";

import { useEffect, useState } from "react";
import { getAvailableSlots, createAppointment } from "@/lib/booking.api";
import { useAuth } from "@/context/AuthContext";

export default function BookingCalendarPage() {
  const { user } = useAuth();
  const [date, setDate] = useState<string>("");
  const [slots, setSlots] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const businessId = user?.businessId || "";
  const requesterName = user?.email?.trim() || "";

  const fetchSlots = async () => {
    if (!businessId || !date) {
      setSlots([]);
      return;
    }

    try {
      setLoading(true);

      const res = await getAvailableSlots(businessId, date);
      const formatted = (res.slots || []).map((slot: string) => ({
        value: slot,
        label: new Date(slot).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      setSlots(formatted);
    } catch (err) {
      console.error("Slot load failed:", err);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSlots();
  }, [businessId, date]);

  const handleBooking = async () => {
    if (!businessId || !selectedSlot || !date || !requesterName) {
      return;
    }

    try {
      const start = new Date(selectedSlot);
      const end = new Date(start.getTime() + 30 * 60000);

      await createAppointment({
        businessId,
        name: requesterName,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      alert("Booking confirmed");
      setSelectedSlot(null);
      void fetchSlots();
    } catch (err) {
      console.error("Booking failed:", err);
      alert("Failed to book");
    }
  };

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
      <h1 className="text-lg font-semibold text-gray-900">Booking Calendar</h1>

      <input
        type="date"
        className="w-full rounded-xl border border-blue-100 bg-white/70 px-4 py-2.5 text-sm backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-400"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />

      {loading ? (
        <p className="animate-pulse text-sm text-gray-500">Loading slots...</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {slots.map((slot) => (
            <button
              key={slot.value}
              onClick={() => setSelectedSlot(slot.value)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                selectedSlot === slot.value
                  ? "border-transparent bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md"
                  : "border-blue-100 bg-white/70 text-gray-700 hover:bg-blue-50"
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleBooking}
        disabled={!selectedSlot || !requesterName}
        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg disabled:opacity-60"
      >
        Confirm Booking
      </button>
    </div>
  );
}
