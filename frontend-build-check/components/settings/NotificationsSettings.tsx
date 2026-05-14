"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

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
      const response = await apiFetch<Partial<typeof settings>>("/api/notifications/settings", {
        credentials: "include",
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to load notification settings");
      }

      return response.data;
    },
  });

  useEffect(() => {
    if (data) {
      setSettings({
        email: Boolean(data?.email),
        whatsapp: Boolean(data?.whatsapp),
        leads: Boolean(data?.leads),
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (body: typeof settings) => {
      const response = await apiFetch("/api/notifications/settings", {
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to update notification settings");
      }

      return response.data;
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
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Notification Preferences
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Control how you receive updates and alerts
        </p>
      </div>

      <div className="space-y-4">
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
    <div className="flex items-center justify-between p-4 border border-blue-100 rounded-2xl bg-white/70 backdrop-blur-xl hover:shadow-md transition">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-1">{desc}</p>
      </div>

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
