"use client";

import BookingLayout from "@/components/booking/BookingLayout";
import FeatureGate from "@/components/FeatureGate";

export default function BookingPage() {
  return (
    <div className="p-4 md:p-6 bg-[#f9fcff] min-h-[calc(100vh-64px)]">

      {/* 🔥 HEADER */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            Booking
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Manage your availability, appointments and scheduling
          </p>
        </div>

        {/* 🔥 ACTION BUTTON (future use) */}
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition">
            View Calendar
          </button>

          <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white hover:opacity-90 transition">
            + New Slot
          </button>
        </div>
      </div>

      {/* 🔥 MAIN CARD */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-sm">

        <FeatureGate feature="AI_BOOKING_SCHEDULING">
          <BookingLayout />
        </FeatureGate>

      </div>

    </div>
  );
}