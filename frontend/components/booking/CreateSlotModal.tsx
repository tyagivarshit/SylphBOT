"use client";

import { useState } from "react";
import axios from "axios";

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

      onSuccess?.(); // refresh
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to create slot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Create Booking Slot
        </h2>

        {/* DATE */}
        <div>
          <label className="text-sm font-medium text-gray-800">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm"
          />
        </div>

        {/* START TIME */}
        <div>
          <label className="text-sm font-medium text-gray-800">
            Start Time
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm"
          />
        </div>

        {/* END TIME */}
        <div>
          <label className="text-sm font-medium text-gray-800">
            End Time
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-700"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Slot"}
          </button>
        </div>
      </div>
    </div>
  );
}