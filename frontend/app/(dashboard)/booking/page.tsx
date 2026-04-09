"use client";

import BookingLayout from "@/components/booking/BookingLayout";
import FeatureGate from "@/components/FeatureGate";

export default function BookingPage() {
  const handleOpenSlot = () => {
    // 🔥 trigger modal from DaySlots (custom event)
    window.dispatchEvent(new Event("open-create-slot"));
  };

  const handleScrollToSlots = () => {
    const el = document.getElementById("availability-section");
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Scheduling controls
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Handle availability, appointments, and session planning from a
              cleaner product workspace.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={handleScrollToSlots}
              className="brand-button-secondary min-w-[150px]"
            >
              View Calendar
            </button>

            <button
              onClick={handleOpenSlot}
              className="brand-button-primary min-w-[150px]"
            >
              + New Slot
            </button>
          </div>
        </div>
      </div>

      <section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <FeatureGate feature="AI_BOOKING_SCHEDULING">
          <div id="availability-section">
            <BookingLayout />
          </div>
        </FeatureGate>
      </section>
    </div>
  );
}
