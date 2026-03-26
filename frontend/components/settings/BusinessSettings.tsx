"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = "http://localhost:5000";

export default function BusinessSettings() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    business: "",
    website: "",
    industry: "",
    teamSize: "",
    type: "",
    timezone: "",
  });

  /* =========================
     🔥 FETCH USER
  ========================= */
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/user/me`, {
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
    if (data?.business) {
      setForm({
        business: data.business.name || "",
        website: data.business.website || "",
        industry: data.business.industry || "",
        teamSize: data.business.teamSize || "",
        type: data.business.type || "",
        timezone: data.business.timezone || "",
      });
    }
  }, [data]);

  /* =========================
     🔥 UPDATE
  ========================= */
  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch(`${API_URL}/api/user/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Update failed");

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    mutation.mutate(form);
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">

      {/* TITLE */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Business Information
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Update your workspace details
        </p>
      </div>

      {/* FORM */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <input
          name="business"
          placeholder="Business Name"
          value={form.business}
          onChange={handleChange}
          className="input"
        />

        <input
          name="industry"
          placeholder="Industry"
          value={form.industry}
          onChange={handleChange}
          className="input"
        />

        <input
          name="website"
          placeholder="Website URL"
          value={form.website}
          onChange={handleChange}
          className="input"
        />

        <select
          name="teamSize"
          value={form.teamSize}
          onChange={handleChange}
          className="input"
        >
          <option value="">Team Size</option>
          <option value="1">Solo</option>
          <option value="2-5">2-5</option>
          <option value="5-20">5-20</option>
          <option value="20+">20+</option>
        </select>

        <select
          name="type"
          value={form.type}
          onChange={handleChange}
          className="input"
        >
          <option value="">Business Type</option>
          <option value="agency">Agency</option>
          <option value="creator">Creator</option>
          <option value="saas">SaaS</option>
          <option value="ecommerce">E-commerce</option>
        </select>

        <select
          name="timezone"
          value={form.timezone}
          onChange={handleChange}
          className="input"
        >
          <option value="">Timezone</option>
          <option value="IST">India (IST)</option>
          <option value="UTC">UTC</option>
        </select>

      </div>

      {/* ACTION */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="btn-primary"
        >
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* STYLES */}
      <style jsx>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          color: #111827;
          background: white;
        }

        .input:focus {
          border-color: #14e1c1;
          box-shadow: 0 0 0 2px rgba(20, 225, 193, 0.2);
        }

        .btn-primary {
          background: #14e1c1;
          color: white;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
        }
      `}</style>

    </div>
  );
}