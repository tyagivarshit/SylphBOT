"use client";

import DaySlots from "./DaySlots";
import BookedAppointments from "./BookedAppointments";

export default function BookingLayout() {
  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* 🔥 LEFT - SLOTS */}
      <div className="flex-1">

        <div className="bg-[#f9fcff] border border-gray-200 rounded-xl p-4 md:p-5 h-full">

          {/* HEADER */}
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Availability
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Set your daily slots and working hours
            </p>
          </div>

          {/* CONTENT */}
          <DaySlots />

        </div>
      </div>

      {/* 🔥 RIGHT - BOOKINGS */}
      <div className="flex-1">

        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 h-full">

          {/* HEADER */}
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Appointments
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              View and manage booked sessions
            </p>
          </div>

          {/* CONTENT */}
          <BookedAppointments />

        </div>
      </div>

    </div>
  );
}