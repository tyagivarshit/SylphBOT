"use client";

import { useEffect, useState } from "react";
import axios from "axios";
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
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Available Slots
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg"
        >
          Add Slot
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-gray-500">
          No slots available
        </p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot: any) => (
            <div
              key={slot.id}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium flex justify-between"
            >
              <span>
                {formatTime(slot.startTime)} -{" "}
                {formatTime(slot.endTime)}
              </span>

              {!slot.isActive && (
                <span className="text-xs text-red-500">
                  Inactive
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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