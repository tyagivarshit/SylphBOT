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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm">

      {/* MODAL */}
      <div className="w-full md:max-w-md bg-[#fdfdfb] rounded-t-2xl md:rounded-2xl p-5 md:p-6 space-y-5 shadow-[0_10px_40px_rgba(0,0,0,0.08)] animate-slideUp">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-[16px] font-semibold text-[#0f172a]">
            Create Slot
          </h2>

          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition"
          >
            <X size={18} className="text-[#6b7280]" />
          </button>
        </div>

        {/* DATE */}
        <div>
          <label className="text-[12px] font-medium text-[#8a8a8a]">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 border border-[#e6e6e2] rounded-xl px-3 py-2 text-[14px] text-[#0f172a] font-medium focus:ring-2 focus:ring-[#C8A96A] outline-none bg-white"
          />
        </div>

        {/* START */}
        <div>
          <label className="text-[12px] font-medium text-[#8a8a8a]">
            Start Time
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full mt-1 border border-[#e6e6e2] rounded-xl px-3 py-2 text-[14px] text-[#0f172a] font-semibold focus:ring-2 focus:ring-[#C8A96A] outline-none bg-white"
          />
        </div>

        {/* END */}
        <div>
          <label className="text-[12px] font-medium text-[#8a8a8a]">
            End Time
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full mt-1 border border-[#e6e6e2] rounded-xl px-3 py-2 text-[14px] text-[#0f172a] font-semibold focus:ring-2 focus:ring-[#C8A96A] outline-none bg-white"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3 pt-2">

          <button
            onClick={onClose}
            className="text-[13px] px-3 py-1.5 text-[#6b7280] hover:text-[#0f172a] transition font-medium"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-[#C8A96A] to-[#E6C200] shadow-sm hover:opacity-90 disabled:opacity-60 transition"
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