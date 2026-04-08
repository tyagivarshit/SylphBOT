"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { buildApiUrl, buildAppUrl } from "@/lib/userApi";

export default function DeleteAccount() {
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canDelete = confirm && text === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch(buildApiUrl("/api/user/delete-account"), {
        method: "DELETE",
        credentials: "include",
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || "Delete failed");
      }

      window.location.assign(buildAppUrl("/auth/login"));
    } catch (err) {
      console.error("Delete failed:", err);
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-red-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} className="text-red-600" />
        </div>

        <div>
          <h3 className="text-base sm:text-lg font-semibold text-red-600">
            Delete Account
          </h3>
          <p className="text-xs text-gray-500">Danger Zone</p>
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">
        This action cannot be undone. All your data, leads, connected platforms,
        and automation settings will be permanently deleted.
      </p>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={confirm}
          onChange={() => setConfirm(!confirm)}
          className="accent-red-600 cursor-pointer"
        />
        I understand that this action is permanent
      </label>

      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Type <span className="font-semibold text-gray-700">DELETE</span> to confirm
        </p>

        <input
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          placeholder="DELETE"
          className="w-full px-4 py-2.5 border border-red-100 rounded-xl text-sm bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-red-400 outline-none"
        />
      </div>

      {error && (
        <p className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <button
        onClick={handleDelete}
        disabled={!canDelete || loading}
        className={`w-full px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
          canDelete
            ? "bg-red-600 hover:bg-red-700 text-white hover:shadow-md"
            : "bg-gray-200 text-gray-500 cursor-not-allowed"
        }`}
      >
        {loading ? "Deleting..." : "Delete My Account"}
      </button>
    </div>
  );
}
