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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">

      <div className="w-full md:w-[420px] bg-white h-full p-6 shadow-xl animate-slide">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Booking Details</h2>
          <X className="cursor-pointer" onClick={onClose} />
        </div>

        {/* CONTENT */}
        <div className="space-y-5 text-sm">

          <div>
            <p className="text-gray-500">Customer</p>
            <p className="font-medium">{data.name}</p>
          </div>

          <div>
            <p className="text-gray-500">Date & Time</p>
            <p>{format(data.startTime)}</p>
          </div>

          <div>
            <p className="text-gray-500">Status</p>
            <p>{data.status}</p>
          </div>

        </div>

        {/* ACTIONS */}
        {data.status === "BOOKED" && (
          <div className="mt-8 flex gap-3">

            <button
              onClick={handleCancel}
              className="flex-1 bg-red-500 text-white py-2 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>

            <button className="flex-1 bg-gray-100 py-2 rounded-xl text-sm font-medium">
              Reschedule
            </button>

          </div>
        )}

      </div>

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