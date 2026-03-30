"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";
import CreateSlotModal from "./CreateSlotModal";
import { useAuth } from "@/context/AuthContext";

export default function DaySlots({ onUpdate }: any) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const businessId = user?.businessId;

  const fetchSlots = async () => {
    if (!businessId) return;

    try {
      setLoading(true);

      const res = await api.get(`/api/availability/${businessId}`);
      setSlots(res.data.availability || []);

    } catch (err) {
      console.error("FETCH SLOTS ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!businessId) return;
    fetchSlots();
  }, [businessId]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);

    let hours = h;
    const minutes = m.toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    hours = hours === 0 ? 12 : hours;

    return `${hours}:${minutes} ${ampm}`;
  };

  return (
    <div className="h-full flex flex-col">

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Available Slots
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">

        {!businessId ? (
          <p className="text-sm text-gray-500 text-center py-6">
            Loading business...
          </p>
        ) : loading ? (
          <div className="flex justify-center py-6">
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
              className="flex justify-between border p-2 rounded-xl"
            >
              <div>
                {formatTime(slot.startTime)} –{" "}
                {formatTime(slot.endTime)}
              </div>

              <span className="text-xs">
                {slot.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))
        )}

      </div>

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