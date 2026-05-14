"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

type AISettingsFormProps = {
  clientId?: string;
};

export default function AISettingsForm({ clientId = "" }: AISettingsFormProps) {
  const [tone, setTone] = useState("Friendly");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setFetching(true);
        const response = await apiFetch<{
          aiTone?: string | null;
          salesInstructions?: string | null;
          clientId?: string | null;
        }>(`/api/training/settings${query}`);

        if (response.success && response.data) {
          setTone(response.data.aiTone || "Friendly");
          setInstructions(response.data.salesInstructions || "");
        }
      } catch (err) {
        console.error("Load settings error:", err);
      } finally {
        setFetching(false);
      }
    };

    void loadSettings();
  }, [query]);

  const handleSave = async () => {
    try {
      setLoading(true);

      const response = await apiFetch("/api/training/settings", {
        method: "POST",
        body: JSON.stringify({
          aiTone: tone,
          salesInstructions: instructions,
          clientId: clientId || undefined,
        }),
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to save settings");
      }

      alert("âœ… AI settings saved");
    } catch (err) {
      console.error(err);
      alert("âŒ Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <p className="text-sm text-gray-500">Loading settings...</p>;
  }

  return (
    <div className="space-y-5 rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-sm">
      <label className="text-sm font-semibold text-slate-800">AI Tone</label>

      <select
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
      >
        <option>Friendly</option>
        <option>Professional</option>
        <option>Sales</option>
        <option>Luxury</option>
      </select>

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Custom sales instructions..."
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
        rows={4}
      />

      <button
        onClick={handleSave}
        disabled={loading}
        className="brand-button-primary w-full"
      >
        {loading ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
