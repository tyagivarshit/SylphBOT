"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, updateCurrentUser } from "@/lib/userApi";

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
    queryFn: fetchCurrentUser,
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
    mutationFn: updateCurrentUser,
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(["me"], updatedUser);
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
    return (
      <div className="text-sm text-gray-500 animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        <input
          name="business"
          placeholder="Business Name"
          value={form.business}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <input
          name="industry"
          placeholder="Industry"
          value={form.industry}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <input
          name="website"
          placeholder="Website URL"
          value={form.website}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <select
          name="teamSize"
          value={form.teamSize}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
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
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
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
          className="w-full px-4 py-2.5 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
        >
          <option value="">Timezone</option>
          <option value="IST">India (IST)</option>
          <option value="UTC">UTC</option>
        </select>

      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-70"
        >
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
