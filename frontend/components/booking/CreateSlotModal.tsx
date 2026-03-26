"use client";

import { useState } from "react";
import axios from "axios";
import { X } from "lucide-react";

export default function CreateSlotModal({
  open,
  onClose,
  onSuccess,
}: any) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);

  const businessId = "YOUR_BUSINESS_ID"; // replace later

  if (!open) return null;

  /* ============================================
  CREATE SLOT
  ============================================ */
  const handleCreate = async () => {
    if (!date || !startTime || !endTime) {
      alert("All fields required");
      return;
    }

    if (startTime >= endTime) {
      alert("Start time must be before end time");
      return;
    }

    try {
      setLoading(true);

      const dayOfWeek = new Date(date).getDay();

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/availability`,
        {
          businessId,
          dayOfWeek,
          startTime,
          endTime,
          slotDuration: 30,
          bufferTime: 0,
        },
        { withCredentials: true }
      );

      onSuccess?.();
      onClose();

      // reset
      setDate("");
      setStartTime("");
      setEndTime("");

    } catch (err) {
      console.error(err);
      alert("Failed to create slot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">

      {/* 🔥 CARD */}
      <div className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl p-5 md:p-6 space-y-4 animate-slideUp">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-900">
            Create Slot
          </h2>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* DATE */}
        <div>
          <label className="text-xs font-medium text-gray-700">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#14E1C1] outline-none"
          />
        </div>

        {/* START */}
        <div>
          <label className="text-xs font-medium text-gray-700">
            Start Time
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#14E1C1] outline-none"
          />
        </div>

        {/* END */}
        <div>
          <label className="text-xs font-medium text-gray-700">
            End Time
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#14E1C1] outline-none"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2 pt-2">

          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Slot"}
          </button>

        </div>
      </div>

      {/* 🔥 ANIMATION */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(40px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slideUp {
          animation: slideUp 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}