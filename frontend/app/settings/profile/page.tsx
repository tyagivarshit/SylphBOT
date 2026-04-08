"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentUser,
  updateCurrentUser,
  uploadUserAvatar,
} from "@/lib/userApi";

export default function ProfilePage() {
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    business: "",
    website: "",
    industry: "",
    teamSize: "",
    type: "",
    timezone: "",
  });

  /* =========================
     🔥 GET USER
  ========================= */
  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60 * 5,
  });

  /* =========================
     🔥 AUTO FILL (FINAL FIX)
  ========================= */
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,

        // ✅ NEVER override once set (important)
        name: prev.name || user?.name || "",
        email: prev.email || user?.email || "",

        // ✅ always update these
        phone: user?.phone || "",
        business: user?.business?.name || "",
        website: user?.business?.website || "",
        industry: user?.business?.industry || "",
        teamSize: user?.business?.teamSize || "",
        type: user?.business?.type || "",
        timezone: user?.business?.timezone || "",
      }));

      if (user?.avatar) {
        setImage(user.avatar);
      }
    }
  }, [user]);

  /* =========================
     🔥 UPDATE USER
  ========================= */
  const mutation = useMutation({
    mutationFn: updateCurrentUser,
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
    },
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    mutation.mutate({
      name: form.name,
      phone: form.phone,
      business: form.business,
      website: form.website,
      industry: form.industry,
      teamSize: form.teamSize,
      type: form.type,
      timezone: form.timezone,
    });
  };

  /* =========================
     🔥 AVATAR UPLOAD
  ========================= */
  const handleImage = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    const previousImage = image;
    const previewUrl = URL.createObjectURL(file);
    setImage(previewUrl);

    try {
      const updatedUser = await uploadUserAvatar(file);
      setImage(updatedUser.avatar || null);
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (error) {
      console.error("Avatar upload error:", error);
      setImage(previousImage);
    } finally {
      URL.revokeObjectURL(previewUrl);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-900">Loading profile...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* HEADER */}
          <div className="p-6 border-b border-gray-200 flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-white text-lg font-semibold">
                {image ? (
                  <img src={image} className="w-full h-full object-cover" />
                ) : (
                  form.name?.[0] || "U"
                )}
              </div>

              {editing && (
                <label className="absolute bottom-0 right-0 bg-black text-white text-xs px-2 py-0.5 rounded cursor-pointer">
                  Edit
                  <input type="file" hidden onChange={handleImage} />
                </label>
              )}
            </div>

            <div>
              <p className="text-lg font-semibold text-gray-900">
                {form.name || "Your Name"}
              </p>
              <p className="text-sm text-gray-900 font-medium">
                {form.email || "email@example.com"}
              </p>
            </div>
          </div>

          {/* BODY */}
          <div className="p-6 space-y-8">

            {/* PERSONAL */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Personal Info
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">

                <input
                  name="name"
                  placeholder="Your Name"
                  value={form.name}
                  onChange={handleChange}
                  disabled={!editing}
                  className="input"
                />

                <input
                  value={form.email}
                  placeholder="Email Address"
                  disabled
                  className="input bg-gray-100 text-gray-900 cursor-not-allowed"
                />

                <input
                  name="phone"
                  placeholder="Phone Number"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={!editing}
                  className="input sm:col-span-2"
                />

              </div>
            </div>

            {/* BUSINESS */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Business Info
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">

                <input name="business" placeholder="Business Name" value={form.business} onChange={handleChange} disabled={!editing} className="input" />
                <input name="industry" placeholder="Industry (e.g. Marketing)" value={form.industry} onChange={handleChange} disabled={!editing} className="input" />
                <input name="website" placeholder="Website URL" value={form.website} onChange={handleChange} disabled={!editing} className="input" />

                <select name="teamSize" value={form.teamSize} onChange={handleChange} disabled={!editing} className="input">
                  <option value="">Team Size</option>
                  <option value="1">Solo</option>
                  <option value="2-5">2-5</option>
                  <option value="5-20">5-20</option>
                  <option value="20+">20+</option>
                </select>

                <select name="type" value={form.type} onChange={handleChange} disabled={!editing} className="input">
                  <option value="">Business Type</option>
                  <option value="agency">Agency</option>
                  <option value="creator">Creator</option>
                  <option value="saas">SaaS</option>
                  <option value="ecommerce">E-commerce</option>
                </select>

                <select name="timezone" value={form.timezone} onChange={handleChange} disabled={!editing} className="input">
                  <option value="">Timezone</option>
                  <option value="IST">India (IST)</option>
                  <option value="UTC">UTC</option>
                </select>

              </div>
            </div>

          </div>

          {/* ACTIONS */}
          <div className="p-5 border-t border-gray-200 flex justify-end gap-3">

            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSave}
                  disabled={mutation.isPending}
                  className="btn-primary"
                >
                  {mutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="btn-dark"
              >
                Edit Profile
              </button>
            )}

          </div>

        </div>
      </div>

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
          padding: 10px 14px;
          border-radius: 10px;
          font-weight: 500;
        }

        .btn-dark {
          background: #111827;
          color: white;
          padding: 10px 14px;
          border-radius: 10px;
          font-weight: 500;
        }

        .btn-secondary {
          border: 1px solid #d1d5db;
          padding: 10px 14px;
          border-radius: 10px;
          color: #111827;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
