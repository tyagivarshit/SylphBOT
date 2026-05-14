"use client";

import BookingTabs from "./BookingTabs";
import DaySlots from "./DaySlots";

export default function BookingLayout() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">

      {/* 🔥 LEFT - AVAILABILITY */}
      <div className="flex-1">
        <div className="flex h-full flex-col rounded-[26px] border border-slate-200/80 bg-white/84 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-6">

          {/* HEADER */}
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">
              Availability
            </h2>

            <p className="text-xs text-gray-500 mt-1">
              Manage your working hours and slots
            </p>
          </div>

          {/* CONTENT */}
          <div className="flex-1">
            <DaySlots />
          </div>

        </div>
      </div>

      {/* 🔥 RIGHT - BOOKINGS */}
      <div className="flex-1">
        <div className="flex h-full flex-col rounded-[26px] border border-slate-200/80 bg-white/84 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-6">

          {/* HEADER */}
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">
              Appointments
            </h2>

            <p className="text-xs text-gray-500 mt-1">
              View and manage booked sessions
            </p>
          </div>

          {/* CONTENT */}
          <div className="flex-1">
            <BookingTabs />
          </div>

        </div>
      </div>

    </div>
  );
}
