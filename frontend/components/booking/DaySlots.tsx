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

  /* 🔥 FETCH */
  useEffect(() => {
    if (!businessId) return;
    fetchSlots();
  }, [businessId]);

  /* 🔥 GLOBAL TRIGGER (IMPORTANT) */
  useEffect(() => {
    const openModal = () => setOpen(true);

    window.addEventListener("open-create-slot", openModal);

    return () => {
      window.removeEventListener("open-create-slot", openModal);
    };
  }, []);

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

      {/* HEADER */}
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-sm font-semibold text-gray-900">
          Available Slots
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md transition active:scale-[0.96]"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto space-y-3">

        {!businessId ? (
          <p className="text-xs text-gray-500 text-center py-8 font-medium">
            Loading business...
          </p>
        ) : loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-blue-200 rounded-2xl bg-white/70 backdrop-blur-xl">
            <p className="text-sm font-medium text-gray-800">
              No slots available
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Create your first availability slot
            </p>
          </div>
        ) : (
          slots.map((slot: any) => (
            <div
              key={slot.id}
              className="flex justify-between items-center px-4 py-3 rounded-2xl bg-white/80 backdrop-blur-xl border border-blue-100 shadow-sm hover:shadow-md transition"
            >
              <div className="text-sm font-medium text-gray-800">
                {formatTime(slot.startTime)} –{" "}
                {formatTime(slot.endTime)}
              </div>

              <span
                className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  slot.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {slot.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          ))
        )}

      </div>

      {/* MODAL */}
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