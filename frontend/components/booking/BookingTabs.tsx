"use client";

import { useState } from "react";
import BookedAppointments from "./BookedAppointments";

const tabs = ["UPCOMING", "CANCELLED", "RESCHEDULED"];

export default function BookingTabs() {
  const [active, setActive] = useState("UPCOMING");

  return (
    <div className="flex flex-col h-full">

      {/* 🔥 iOS SEGMENT CONTROL */}
      <div className="flex bg-[#f1f1ef] rounded-xl p-1 mb-4 border border-[#e6e6e2]">

        {tabs.map((t) => {
          const isActive = active === t;

          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={`flex-1 text-[12px] py-2 rounded-lg font-medium transition-all duration-200 ${
                isActive
                  ? "bg-white text-[#0f172a] shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                  : "text-[#6b7280] hover:text-[#0f172a]"
              }`}
            >
              {t}
            </button>
          );
        })}

      </div>

      {/* CONTENT */}
      <BookedAppointments filter={active} />

    </div>
  );
}