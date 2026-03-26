"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Plus } from "lucide-react";
import CreateSlotModal from "./CreateSlotModal";

export default function DaySlots({ onUpdate }: any) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const businessId = "YOUR_BUSINESS_ID"; // TODO: replace

  /* ============================================
  FETCH SLOTS
  ============================================ */
  const fetchSlots = async () => {
    try {
      setLoading(true);

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/availability/${businessId}`,
        { withCredentials: true }
      );

      setSlots(res.data.availability || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  /* ============================================
  FORMAT TIME
  ============================================ */
  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    const date = new Date();
    date.setHours(Number(h), Number(m));

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-full flex flex-col">

      {/* 🔥 HEADER */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Available Slots
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white font-medium hover:opacity-90 transition"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* 🔥 CONTENT */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No slots available
          </p>
        ) : (
          slots.map((slot: any) => (
            <div
              key={slot.id}
              className="flex justify-between items-center border border-gray-200 rounded-xl px-3 py-2 bg-white hover:bg-gray-50 transition"
            >
              {/* TIME */}
              <div className="text-sm font-medium text-gray-900">
                {formatTime(slot.startTime)} –{" "}
                {formatTime(slot.endTime)}
              </div>

              {/* STATUS */}
              <div className="flex items-center gap-2">

                {slot.isActive ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">
                    Active
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                    Inactive
                  </span>
                )}

              </div>
            </div>
          ))
        )}

      </div>

      {/* 🔥 MODAL */}
      <CreateSlotModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          fetchSlots();
          onUpdate?.();
        }}
      />
    </div>
  );
}