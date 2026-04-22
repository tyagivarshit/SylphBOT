"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/userApi";

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    email: true,
    whatsapp: false,
    leads: true,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/notifications/settings"), {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load notification settings");
      }

      return res.json();
    },
  });

  useEffect(() => {
    if (data) {
      setSettings({
        email: Boolean(data.email),
        whatsapp: Boolean(data.whatsapp),
        leads: Boolean(data.leads),
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (body: typeof settings) => {
      const res = await fetch(buildApiUrl("/api/notifications/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to update notification settings");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notification-settings"],
      });
    },
  });

  const toggle = (key: keyof typeof settings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    mutation.mutate(updated);
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500 animate-pulse">Loading...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm bg-red-100 text-red-600 px-3 py-2 rounded-md inline-block">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <Toggle
          label="Email Notifications"
          value={settings.email}
          onChange={() => toggle("email")}
        />

        <Toggle
          label="WhatsApp Alerts"
          value={settings.whatsapp}
          onChange={() => toggle("whatsapp")}
        />

        <Toggle
          label="Lead Notifications"
          value={settings.leads}
          onChange={() => toggle("leads")}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-white/70 p-4 backdrop-blur-xl transition hover:shadow-md">
      <p className="text-sm font-semibold text-gray-900">{label}</p>

      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
          value
            ? "bg-gradient-to-r from-blue-600 to-cyan-500"
            : "bg-gray-300"
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
