"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DeleteAccount() {
  const router = useRouter();

  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const canDelete = confirm && text === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;

    try {
      setLoading(true);

      const res = await fetch(
        "http://localhost:5000/api/user/delete-account",
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error("Delete failed");
      }

      // 🔥 redirect after delete
      router.push("/login");

    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("Failed to delete account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-red-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-6 max-w-lg">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} className="text-red-600" />
        </div>

        <div>
          <h3 className="text-base sm:text-lg font-semibold text-red-600">
            Delete Account
          </h3>
          <p className="text-xs text-gray-500">Danger Zone</p>
        </div>
      </div>

      {/* Warning */}
      <p className="text-sm text-gray-600">
        This action cannot be undone. All your data, leads, connected platforms,
        and automation settings will be permanently deleted.
      </p>

      {/* Checkbox */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={confirm}
          onChange={() => setConfirm(!confirm)}
          className="accent-red-600 cursor-pointer"
        />
        I understand that this action is permanent
      </label>

      {/* Input */}
      <div className="space-y-1">
        <p className="text-xs text-gray-500">
          Type <span className="font-semibold text-gray-700">DELETE</span> to confirm
        </p>

        <input
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          placeholder="DELETE"
          className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Button */}
      <button
        onClick={handleDelete}
        disabled={!canDelete || loading}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition
        ${
          canDelete
            ? "bg-red-600 hover:bg-red-700 text-white"
            : "bg-gray-200 text-gray-500 cursor-not-allowed"
        }`}
      >
        {loading ? "Deleting..." : "Delete My Account"}
      </button>

    </div>
  );
}