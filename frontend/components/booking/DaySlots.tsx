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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[15px] font-semibold text-[#0f172a]">
          Available Slots
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-xl font-semibold text-white bg-gradient-to-r from-[#C8A96A] to-[#E6C200] shadow-sm hover:opacity-90 transition active:scale-[0.96]"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto space-y-2">

        {!businessId ? (
          <p className="text-[13px] text-[#6b7280] text-center py-6 font-medium">
            Loading business...
          </p>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-[#e6e6e2] border-t-[#0f172a] rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-[13px] text-[#6b7280] text-center py-6 font-medium">
            No slots available
          </p>
        ) : (
          slots.map((slot: any) => (
            <div
              key={slot.id}
              className="flex justify-between items-center px-3 py-2 rounded-xl bg-[#ffffffcc] backdrop-blur-md border border-[#e8e8e4] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
            >
              <div className="text-[13px] font-medium text-[#374151]">
                {formatTime(slot.startTime)} –{" "}
                {formatTime(slot.endTime)}
              </div>

              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  slot.isActive
                    ? "bg-[#e7f8ef] text-[#1f9254]"
                    : "bg-[#f1f1ef] text-[#6b7280]"
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