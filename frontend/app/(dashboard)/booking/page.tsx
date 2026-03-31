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
    <div className="p-4 md:p-6 bg-[#f7f7f5] min-h-[calc(100vh-64px)]">

      {/* HEADER */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
            Booking
          </h1>

          <p className="text-[13px] text-[#6b7280] mt-1 font-medium">
            Manage your availability, appointments and scheduling
          </p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-2">

          {/* VIEW CALENDAR (scroll to slots for now) */}
          <button
            onClick={handleScrollToSlots}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl border border-[#e6e6e2] bg-white hover:bg-[#f1f1ef] transition"
          >
            View Calendar
          </button>

          {/* NEW SLOT (OPEN MODAL) */}
          <button
            onClick={handleOpenSlot}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl text-white bg-gradient-to-r from-[#C8A96A] to-[#E6C200] shadow-sm hover:opacity-90 transition active:scale-[0.96]"
          >
            + New Slot
          </button>

        </div>
      </div>

      {/* MAIN CARD */}
      <div className="bg-[#ffffffcc] backdrop-blur-md border border-[#e8e8e4] rounded-2xl p-4 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">

        <FeatureGate feature="AI_BOOKING_SCHEDULING">
          <div id="availability-section">
            <BookingLayout />
          </div>
        </FeatureGate>

      </div>

    </div>
  );
}