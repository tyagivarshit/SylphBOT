"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, updateCurrentUser, uploadUserAvatar } from "@/lib/userApi";

type ProfileFormState = {
  name: string;
  email: string;
  phone: string;
  business: string;
  website: string;
  industry: string;
  teamSize: string;
  type: string;
  timezone: string;
};

const INITIAL_FORM: ProfileFormState = {
  name: "",
  email: "",
  phone: "",
  business: "",
  website: "",
  industry: "",
  teamSize: "",
  type: "",
  timezone: "",
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(INITIAL_FORM);

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      business: user.business?.name || "",
      website: user.business?.website || "",
      industry: user.business?.industry || "",
      teamSize: user.business?.teamSize || "",
      type: user.business?.type || "",
      timezone: user.business?.timezone || "",
    });

    setImage(user.avatar || null);
  }, [user]);

  const mutation = useMutation({
    mutationFn: updateCurrentUser,
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
    },
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }));
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

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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
      event.target.value = "";
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-900">Loading profile...</div>;
  }

  if (!user) {
    return <div className="p-6 text-gray-900">Unable to load account profile.</div>;
  }

  const displayName = form.name.trim() || user.email;
  const displayEmail = form.email.trim() || user.email;
  const avatarInitial = displayName.charAt(0).toUpperCase();
  const workspaceName =
    user.workspace?.name?.trim() || user.business?.name?.trim() || "Unassigned workspace";
  const connectedAccountCount = user.connectedAccounts?.totalConnected ?? 0;

  return (
    <div className="flex min-h-screen justify-center bg-gray-50 p-4 sm:p-6">
      <div className="w-full max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-4 border-b border-gray-200 p-6">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-lg font-semibold text-white">
                {image ? (
                  <img
                    src={image}
                    alt={`${displayName} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  avatarInitial
                )}
              </div>

              {editing ? (
                <label className="absolute bottom-0 right-0 cursor-pointer rounded bg-black px-2 py-0.5 text-xs text-white">
                  Edit
                  <input type="file" hidden onChange={handleImage} />
                </label>
              ) : null}
            </div>

            <div>
              <p className="text-lg font-semibold text-gray-900">{displayName}</p>
              <p className="text-sm font-medium text-gray-900">{displayEmail}</p>
              <p className="text-xs text-gray-500">
                Workspace: {workspaceName} · Connected accounts: {connectedAccountCount}
              </p>
            </div>
          </div>

          <div className="space-y-8 p-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Personal Info</h2>

              <div className="grid gap-4 sm:grid-cols-2">
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
                  className="input cursor-not-allowed bg-gray-100 text-gray-900"
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

            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Business Info</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  name="business"
                  placeholder="Business Name"
                  value={form.business}
                  onChange={handleChange}
                  disabled={!editing}
                  className="input"
                />
                <input
                  name="industry"
                  placeholder="Industry (e.g. Marketing)"
                  value={form.industry}
                  onChange={handleChange}
                  disabled={!editing}
                  className="input"
                />
                <input
                  name="website"
                  placeholder="Website URL"
                  value={form.website}
                  onChange={handleChange}
                  disabled={!editing}
                  className="input"
                />

                <select
                  name="teamSize"
                  value={form.teamSize}
                  onChange={handleChange}
                  disabled={!editing}
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
                  disabled={!editing}
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
                  disabled={!editing}
                  className="input"
                >
                  <option value="">Timezone</option>
                  <option value="IST">India (IST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 p-5">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-secondary">
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
              <button onClick={() => setEditing(true)} className="btn-dark">
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
