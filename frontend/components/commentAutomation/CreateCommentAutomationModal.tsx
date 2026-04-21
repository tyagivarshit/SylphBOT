"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, Info, Sparkles } from "lucide-react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { api } from "@/lib/api";
import { buildApiUrl } from "@/lib/url";
import LoadingButton from "@/components/ui/LoadingButton";
import { notify } from "@/lib/toast";

type ReplyMode = "AI" | "TEMPLATE";

type CommentAutomationDraft = {
  id: string;
  keyword?: string | null;
  replyText?: string | null;
  dmText?: string | null;
  aiPrompt?: string | null;
  clientId?: string | null;
  reelId?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastTriggeredAt?: string | null;
};

type ClientOption = {
  id: string;
  name?: string | null;
  pageId?: string | null;
};

type MediaItem = {
  id: string;
  caption?: string | null;
  media_url?: string | null;
};

type UsagePayload = {
  addonCredits?: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  addons: {
    aiCredits: number;
  };
};

export default function CreateCommentAutomationModal({
  open,
  onClose,
  onSaved,
  editData,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (automation: CommentAutomationDraft) => void;
  editData?: CommentAutomationDraft | null;
}) {
  const { openUpgrade } = useUpgrade();
  const isEdit = !!editData;

  const [keyword, setKeyword] = useState("");
  const [reply, setReply] = useState("");
  const [dm, setDm] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [replyMode, setReplyMode] = useState<ReplyMode>("TEMPLATE");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedPost, setSelectedPost] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");

  const addonCredits = usage?.addonCredits ?? usage?.addons.aiCredits ?? 0;
  const aiRemaining = usage?.ai.remaining ?? 0;
  const aiDisabled = usage ? aiRemaining <= 0 && addonCredits <= 0 : false;

  const helperNotice = useMemo(() => {
    if (aiDisabled) {
      return {
        tone: "rose",
        message: "You've used all your AI replies for today.",
      };
    }

    if (aiRemaining <= 0 && addonCredits > 0) {
      return {
        tone: "amber",
        message: "Today's included AI replies are used up. New DM replies will use extra credits.",
      };
    }

    return null;
  }, [addonCredits, aiDisabled, aiRemaining]);

  const checklist = useMemo(
    () => [
      {
        id: "01",
        title: "Pick the Instagram account",
        description: "Choose the connected page that owns the post or reel.",
      },
      {
        id: "02",
        title: "Choose the post",
        description: "Select the exact content this comment trigger should watch.",
      },
      {
        id: "03",
        title: "Define the public and DM replies",
        description: "Keep the public reply free, then choose AI or template for the DM.",
      },
    ],
    []
  );

  const openUsageLimitModal = () => {
    openUpgrade({
      variant: "usage_limit",
      title: "You've used all your AI replies for today",
      description:
        "Buy extra credits to keep AI DM replies running, or upgrade for a larger daily allowance.",
      remainingCredits: aiRemaining,
      addonCredits,
    });
  };

  useEffect(() => {
    if (!open) {
      setKeyword("");
      setReply("");
      setDm("");
      setAiPrompt("");
      setReplyMode("TEMPLATE");
      setClientId("");
      setSelectedPost("");
      setMedia([]);
      setUsage(null);
      setError("");
      setLoading(false);
      return;
    }

    const initialReplyMode: ReplyMode =
      typeof editData?.aiPrompt === "string" && editData.aiPrompt.trim()
        ? "AI"
        : "TEMPLATE";

    setKeyword(editData?.keyword || "");
    setReply(editData?.replyText || "");
    setDm(editData?.dmText || "");
    setAiPrompt(editData?.aiPrompt || "");
    setReplyMode(initialReplyMode);
    setClientId(editData?.clientId || "");
    setSelectedPost(editData?.reelId || "");
    setError("");
  }, [editData, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const fetchClients = async () => {
      try {
        setLoadingClients(true);
        const response = await api.get("/api/clients");
        const data = Array.isArray(response.data)
          ? (response.data as ClientOption[])
          : ((response.data?.clients || []) as ClientOption[]);
        setClients(data);
      } catch {
        setError("Failed to load clients");
      } finally {
        setLoadingClients(false);
      }
    };

    const fetchUsage = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/usage"), {
          credentials: "include",
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.success === false) {
          return;
        }

        setUsage(data as UsagePayload);
      } catch {}
    };

    void fetchClients();
    void fetchUsage();
  }, [open]);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const fetchMedia = async () => {
      try {
        setLoadingMedia(true);

        const response = await api.get(`/api/instagram/media?clientId=${clientId}`);
        setMedia(response.data?.data || []);
      } catch {
        setError("Failed to load posts");
      } finally {
        setLoadingMedia(false);
      }
    };

    void fetchMedia();
  }, [clientId]);

  const handleSubmit = async () => {
    if (!clientId || !selectedPost || !keyword.trim() || !reply.trim()) {
      const message =
        "Instagram account, post, keyword, and public reply are required.";
      setError(message);
      return;
    }

    if (replyMode === "AI" && aiDisabled) {
      setError("You've used all your AI replies for today.");
      openUsageLimitModal();
      return;
    }

    if (replyMode === "AI" && !aiPrompt.trim()) {
      const message = "Add an AI instruction for the DM reply.";
      setError(message);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        clientId,
        reelId: selectedPost,
        keyword: keyword.trim(),
        replyText: reply.trim(),
        dmText: replyMode === "TEMPLATE" ? dm.trim() : "",
        aiPrompt: replyMode === "AI" ? aiPrompt.trim() : undefined,
      };

      const response = isEdit
        ? await api.patch(`/api/comment-triggers/${editData?.id}`, payload)
        : await api.post("/api/comment-triggers", payload);

      const savedAutomation =
        (response.data?.trigger as CommentAutomationDraft | undefined) || {
          id: editData?.id || crypto.randomUUID(),
          ...payload,
          isActive: editData?.isActive ?? true,
          createdAt: editData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastTriggeredAt: editData?.lastTriggeredAt || null,
        };

      onSaved?.(savedAutomation);
      notify.success(isEdit ? "Comment automation updated" : "Comment automation created");
      onClose();
    } catch (submitError: unknown) {
      const message =
        (submitError as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (isEdit ? "Failed to update" : "Failed to create");

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedMedia = media.find((item) => item.id === selectedPost);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 backdrop-blur-sm sm:items-center sm:px-0">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-blue-100 bg-white/95 p-5 shadow-xl backdrop-blur-xl sm:rounded-2xl sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                {isEdit ? "Edit Comment Automation" : "Create Comment Automation"}
              </h2>
              <p className="text-sm text-slate-500">
                Public comment replies stay free. The DM follow-up can use AI credits
                or a free template.
              </p>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-100 px-3 py-2 text-xs text-red-600 sm:text-sm">
                {error}
              </p>
            ) : null}

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Workflow
              </p>
              <div className="mt-3 space-y-3">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                      {item.id}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span>DM Reply Mode</span>
                  <button
                    type="button"
                    title="AI replies use credits. Template replies are free."
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                  >
                    <Info size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
                    AI Remaining Today: {aiRemaining}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
                    Extra Credits: {addonCredits}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (aiDisabled) {
                      openUsageLimitModal();
                      return;
                    }

                    setReplyMode("AI");
                  }}
                  className={`rounded-[18px] border px-4 py-3 text-left transition ${
                    replyMode === "AI"
                      ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700"
                  } ${aiDisabled ? "border-dashed" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Bot size={16} />
                    Use AI Reply
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Uses AI credits to generate the DM follow-up.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReplyMode("TEMPLATE")}
                  className={`rounded-[18px] border px-4 py-3 text-left transition ${
                    replyMode === "TEMPLATE"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={16} />
                    Use Template Reply
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Free DM template reply. Sends exactly what you write.
                  </span>
                </button>
              </div>

              {helperNotice ? (
                <div
                  className={`mt-3 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm md:flex-row md:items-center md:justify-between ${
                    helperNotice.tone === "rose"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <span>{helperNotice.message}</span>
                  <Link
                    href="/billing"
                    className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      helperNotice.tone === "rose"
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : "bg-amber-500 text-white hover:bg-amber-600"
                    }`}
                  >
                    Buy credits
                  </Link>
                  {helperNotice.tone === "rose" ? (
                    <button
                      type="button"
                      onClick={openUsageLimitModal}
                      className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Upgrade plan
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700">
                1. Instagram Account
              </label>

              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setSelectedPost("");
                  setMedia([]);
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="">
                  {loadingClients ? "Loading..." : "Select account"}
                </option>

                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name || client.pageId}
                  </option>
                ))}
              </select>
            </div>

            {clientId ? (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  2. Select Post / Reel
                </label>

                <select
                  value={selectedPost}
                  onChange={(event) => setSelectedPost(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">
                    {loadingMedia ? "Loading..." : "Select post"}
                  </option>

                  {media.map((item) => (
                    <option key={item.id} value={item.id}>
                      {(item.caption || "No caption").slice(0, 60)}
                    </option>
                  ))}
                </select>

                {selectedMedia?.media_url ? (
                  <div className="mt-3 rounded-xl border border-blue-100 bg-white/70 p-2 backdrop-blur">
                    <img
                      src={selectedMedia.media_url}
                      alt="Selected Instagram media"
                      className="h-36 w-full rounded-lg object-cover"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700">
                3. Trigger Keyword
              </label>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="price, cost, fees"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <p className="mt-2 text-xs text-slate-500">
                Use comma-separated keywords if several comment variations should
                trigger the same automation.
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700">
                4. Public Comment Reply
              </label>

              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Thanks! I've sent you a DM."
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <p className="mt-2 text-xs text-slate-500">
                This public reply is always a free template.
              </p>
            </div>

            {replyMode === "AI" ? (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  5. AI DM Instruction
                </label>

                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  rows={4}
                  placeholder="Tell the AI what to say in the DM. Example: answer pricing briefly, ask one qualifier, and invite the lead to continue the conversation."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Uses AI credits for the private DM reply. The public comment above
                  stays free.
                </p>
              </div>
            ) : (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  5. DM Template Reply
                </label>

                <textarea
                  value={dm}
                  onChange={(event) => setDm(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  rows={4}
                  placeholder="Write the exact DM you want to send."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Free template reply. If left blank, the public reply may be reused
                  as the DM follow-up.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-blue-100"
              >
                Cancel
              </button>

              <LoadingButton
                onClick={handleSubmit}
                loading={loading}
                loadingLabel="Saving..."
                className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
              >
                {isEdit ? "Save Changes" : "Create Automation"}
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
