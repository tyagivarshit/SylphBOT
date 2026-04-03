"use client";

import { useState } from "react";
import { api } from "@/lib/api";
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

  if (!open) return null;

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

      await api.post("/api/availability", {
        dayOfWeek,
        startTime,
        endTime,
        slotDuration: 30,
        bufferTime: 0,
      });

      onSuccess?.();
      onClose();

      setDate("");
      setStartTime("");
      setEndTime("");

    } catch (err) {
      console.error("CREATE SLOT ERROR:", err);
      alert("Failed to create slot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">

      {/* MODAL */}
      <div className="w-full md:max-w-md bg-white/80 backdrop-blur-xl border border-blue-100 rounded-t-2xl md:rounded-2xl p-6 space-y-5 shadow-xl animate-slideUp">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-900">
            Create Slot
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-blue-50 transition"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* DATE */}
        <div>
          <label className="text-xs font-medium text-gray-500">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-400 outline-none bg-white/70"
          />
        </div>

        {/* START */}
        <div>
          <label className="text-xs font-medium text-gray-500">
            Start Time
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full mt-1 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-400 outline-none bg-white/70"
          />
        </div>

        {/* END */}
        <div>
          <label className="text-xs font-medium text-gray-500">
            End Time
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full mt-1 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-400 outline-none bg-white/70"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3 pt-2">

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-gray-700 hover:bg-blue-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md disabled:opacity-60 transition"
          >
            {loading ? "Saving..." : "Save Slot"}
          </button>

        </div>
      </div>

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