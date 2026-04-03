"use client";

import { useRef } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import FeatureGate from "@/components/FeatureGate";

export default function BookingPage() {
  const addSlotRef = useRef<any>(null);

  const handleOpenSlot = () => {
    // 🔥 trigger modal from DaySlots (custom event)
    window.dispatchEvent(new Event("open-create-slot"));
  };

  const handleScrollToSlots = () => {
    const el = document.getElementById("availability-section");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="p-4 md:p-6 bg-gradient-to-br from-blue-50 to-white min-h-[calc(100vh-64px)]">

      {/* HEADER */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Booking
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Manage your availability, appointments and scheduling
          </p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-3">

          {/* VIEW CALENDAR */}
          <button
            onClick={handleScrollToSlots}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-50 text-gray-700 border border-blue-100 hover:bg-blue-100 transition"
          >
            View Calendar
          </button>

          {/* NEW SLOT */}
          <button
            onClick={handleOpenSlot}
            className="px-5 py-2 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md transition active:scale-[0.96]"
          >
            + New Slot
          </button>

        </div>
      </div>

      {/* MAIN CARD */}
      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 md:p-6 shadow-sm">

        <FeatureGate feature="AI_BOOKING_SCHEDULING">
          <div id="availability-section">
            <BookingLayout />
          </div>
        </FeatureGate>

      </div>

    </div>
  );
}