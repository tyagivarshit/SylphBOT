"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { buildAppUrl, changeUserPassword } from "@/lib/userApi";

export default function ChangePassword() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    current: "",
    password: "",
    confirm: "",
  });

  const handleChange = (key: string, value: string) => {
    setError("");
    setSuccess("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const passwordMatch =
    form.password.length > 0 &&
    form.confirm.length > 0 &&
    form.password === form.confirm;
  const canSubmit =
    form.current.trim().length > 0 &&
    form.password.length >= 8 &&
    passwordMatch &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const result = await changeUserPassword({
        currentPassword: form.current,
        newPassword: form.password,
        confirmPassword: form.confirm,
      });

      setSuccess(result?.message || "Password updated successfully.");

      window.setTimeout(() => {
        window.location.assign(buildAppUrl("/auth/login"));
      }, 800);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Password update failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 max-w-lg">
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">
          Change Password
        </h3>

        <p className="text-sm text-gray-500 mt-1">
          Update your account password for better security
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Lock
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type={showCurrent ? "text" : "password"}
            value={form.current}
            onChange={(e) => handleChange("current", e.target.value)}
            placeholder="Current Password"
            className="w-full px-4 py-2.5 pl-10 pr-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
          />

          <button
            type="button"
            onClick={() => setShowCurrent((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
          >
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="relative">
          <Lock
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="password"
            value={form.password}
            onChange={(e) => handleChange("password", e.target.value)}
            placeholder="New Password"
            className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
          />
        </div>

        <div className="relative">
          <Lock
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="password"
            value={form.confirm}
            onChange={(e) => handleChange("confirm", e.target.value)}
            placeholder="Confirm New Password"
            className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
          />
        </div>

        {form.confirm && !passwordMatch && (
          <p className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-md inline-block">
            Passwords do not match
          </p>
        )}

        {error && (
          <p className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        {success && (
          <p className="text-xs bg-green-100 text-green-700 px-3 py-2 rounded-md">
            {success}
          </p>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Use at least 8 characters including letters and numbers.
      </p>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:shadow-lg transition disabled:opacity-60"
      >
        {submitting ? "Updating..." : "Update Password"}
      </button>
    </div>
  );
}
