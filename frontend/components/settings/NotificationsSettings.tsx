"use client";

import { useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function NotificationSettings() {
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState({
    email: true,
    whatsapp: false,
    leads: true,
  });

  /* =========================
     🔥 FETCH SETTINGS
  ========================= */
  const { data, isLoading, isError } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/notifications/settings`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed");

      return res.json();
    },
  });

  /* =========================
     🔥 AUTO FILL
  ========================= */
  useEffect(() => {
    if (data) {
      setSettings({
        email: data.email,
        whatsapp: data.whatsapp,
        leads: data.leads,
      });
    }
  }, [data]);

  /* =========================
     🔥 UPDATE SETTINGS
  ========================= */
  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch(`${API_URL}/api/notifications/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed");

      return res.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notification-settings"],
      });
    },
  });

  const toggle = (key: keyof typeof settings) => {
    const updated = { ...settings, [key]: !settings[key] };

    setSettings(updated);
    mutation.mutate(updated);
  };

  if (isLoading)
    return <div className="text-sm text-gray-500">Loading...</div>;

  if (isError)
    return (
      <div className="text-sm text-red-500">
        Failed to load settings
      </div>
    );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Notification Preferences
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Control how you receive updates and alerts
        </p>
      </div>

      {/* TOGGLES */}
      <div className="space-y-5">

        <Toggle
          label="Email Notifications"
          desc="Receive important updates via email"
          value={settings.email}
          onChange={() => toggle("email")}
        />

        <Toggle
          label="WhatsApp Alerts"
          desc="Get instant alerts on WhatsApp"
          value={settings.whatsapp}
          onChange={() => toggle("whatsapp")}
        />

        <Toggle
          label="Lead Notifications"
          desc="Notify when new leads arrive"
          value={settings.leads}
          onChange={() => toggle("leads")}
        />

      </div>
    </div>
  );
}

/* =========================
   🔥 TOGGLE COMPONENT (PREMIUM)
========================= */

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition">

      {/* TEXT */}
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {label}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {desc}
        </p>
      </div>

      {/* SWITCH */}
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
          value ? "bg-[#14E1C1]" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
            value ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}