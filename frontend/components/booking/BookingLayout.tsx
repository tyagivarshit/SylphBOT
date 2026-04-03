"use client";

import BookingTabs from "./BookingTabs";
import DaySlots from "./DaySlots";

export default function BookingLayout() {
  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* 🔥 LEFT - AVAILABILITY */}
      <div className="flex-1">
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all h-full flex flex-col">

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
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all h-full flex flex-col">

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