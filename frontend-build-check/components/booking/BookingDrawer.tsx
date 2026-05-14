"use client";

import { X } from "lucide-react";
import { cancelAppointment } from "@/lib/booking.api";

export default function BookingDrawer({
  open,
  onClose,
  data,
  onRefresh,
}: any) {
  if (!open || !data) return null;

  const format = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString();
  };

  const handleCancel = async () => {
    try {
      await cancelAppointment(data.id);
      onRefresh?.();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">

      {/* 🔥 DRAWER */}
      <div className="w-full md:w-[420px] bg-white/80 backdrop-blur-xl border-l border-blue-100 h-full p-6 shadow-xl animate-slide flex flex-col">

        {/* 🔥 HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Booking Details
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-blue-50 transition"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* 🔥 CONTENT */}
        <div className="space-y-6 text-sm">

          <div className="p-4 rounded-xl bg-white/70 backdrop-blur border border-blue-100">
            <p className="text-xs text-gray-500">Customer</p>
            <p className="font-semibold text-gray-900 mt-1">
              {data.name}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/70 backdrop-blur border border-blue-100">
            <p className="text-xs text-gray-500">Date & Time</p>
            <p className="text-gray-800 mt-1">
              {format(data.startTime)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/70 backdrop-blur border border-blue-100">
            <p className="text-xs text-gray-500">Status</p>
            <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold">
              {data.status}
            </span>
          </div>

        </div>

        {/* 🔥 ACTIONS */}
        {data.status === "CONFIRMED" && (
          <div className="mt-auto pt-6 flex gap-3">

            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-100 text-red-600 hover:bg-red-200 transition shadow-sm"
            >
              Cancel
            </button>

            <button className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-gray-700 hover:bg-blue-100 transition">
              Reschedule
            </button>

          </div>
        )}

      </div>

      {/* 🔥 ANIMATION */}
      <style jsx>{`
        @keyframes slide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide {
          animation: slide 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
