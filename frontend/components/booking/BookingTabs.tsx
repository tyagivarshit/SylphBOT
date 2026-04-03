"use client";

import { useState } from "react";
import BookedAppointments from "./BookedAppointments";

const tabs = ["UPCOMING", "CANCELLED", "RESCHEDULED"];

export default function BookingTabs() {
  const [active, setActive] = useState("UPCOMING");

  return (
    <div className="flex flex-col h-full">

      {/* 🔥 SEGMENT CONTROL */}
      <div className="flex bg-blue-50 rounded-xl p-1.5 mb-5 border border-blue-100 backdrop-blur-sm">

        {tabs.map((t) => {
          const isActive = active === t;

          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={`flex-1 text-xs py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
            </button>
          );
        })}

      </div>

      {/* 🔥 CONTENT */}
      <div className="flex-1 overflow-hidden">
        <BookedAppointments filter={active} />
      </div>

    </div>
  );
}