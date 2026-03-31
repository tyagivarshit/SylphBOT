"use client";

import BookingTabs from "./BookingTabs";
import DaySlots from "./DaySlots";

export default function BookingLayout() {
  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* LEFT - AVAILABILITY */}
      <div className="flex-1">
        <div className="bg-[#ffffffcc] backdrop-blur-md border border-[#e8e8e4] rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] h-full">

          {/* HEADER */}
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">
              Availability
            </h2>

            <p className="text-[12px] text-[#8a8a8a] mt-1 font-medium">
              Manage your working hours and slots
            </p>
          </div>

          {/* CONTENT */}
          <DaySlots />

        </div>
      </div>

      {/* RIGHT - BOOKINGS */}
      <div className="flex-1">
        <div className="bg-[#ffffffcc] backdrop-blur-md border border-[#e8e8e4] rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] h-full">

          {/* HEADER */}
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">
              Appointments
            </h2>

            <p className="text-[12px] text-[#8a8a8a] mt-1 font-medium">
              View and manage booked sessions
            </p>
          </div>

          {/* CONTENT */}
          <BookingTabs />

        </div>
      </div>

    </div>
  );
}