"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { api } from "@/lib/api";
import { getUsageOverview } from "@/lib/usage.service";
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

type InstagramAccountOption = {
  clientId?: string | null;
  name?: string | null;
  pageId?: string | null;
  igUserId?: string | null;
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

  const [clients, setClients] = useState<InstagramAccountOption[]>([]);
  const [clientId, setClientId] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedPost, setSelectedPost] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [clientsFetchFailed, setClientsFetchFailed] = useState(false);

  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");

  const addonCredits = usage?.addonCredits ?? usage?.addons.aiCredits ?? 0;
  const aiRemaining = usage?.ai.remaining ?? 0;
  const aiDisabled = usage ? aiRemaining <= 0 && addonCredits <= 0 : false;
  const availableClients = useMemo(
    () => clients.filter((client) => Boolean(client.clientId)),
    [clients]
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
      setClients([]);
      setClientsFetchFailed(false);
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

  const fetchInstagramAccounts = useCallback(async () => {
    try {
      setLoadingClients(true);
      setClientsFetchFailed(false);
      console.log("Fetching Instagram accounts for comment automation");

      const response = await api.get("/integrations/instagram/accounts");
      const data = Array.isArray(response.data)
        ? (response.data as InstagramAccountOption[])
        : ((response.data?.accounts || []) as InstagramAccountOption[]);

      console.log("Instagram accounts fetched for comment automation:", data);
      setClients(data);
    } catch (clientError) {
      console.error("Instagram accounts fetch failed", clientError);
      setClients([]);
      setClientsFetchFailed(true);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchInstagramAccounts();
    }
  }, [open, fetchInstagramAccounts]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const fetchUsage = async () => {
      try {
        const data = await getUsageOverview();

        if (!data) {
          return;
        }

        setUsage(data as UsagePayload);
      } catch {}
    };

    void fetchUsage();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!clientId) {
      return;
    }

    const fetchMedia = async () => {
      try {
        setLoadingMedia(true);
        console.log("Fetching Instagram media for comment automation", {
          clientId,
        });

        const response = await api.get(`/instagram/media?clientId=${clientId}`);
        console.log("Instagram media fetched for comment automation:", response.data);
        setMedia(response.data?.data || []);
      } catch (mediaError) {
        console.error("Instagram media fetch failed", mediaError);
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
      setError("AI replies are unavailable today.");
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

      console.log("Saving comment automation", {
        isEdit,
        clientId,
        reelId: selectedPost,
        replyMode,
      });

      const response = isEdit
        ? await api.patch(`/comment-triggers/${editData?.id}`, payload)
        : await api.post("/comment-triggers", payload);

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
            <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
              {isEdit ? "Edit Comment Automation" : "Create Comment Automation"}
            </h2>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-100 px-3 py-2 text-xs text-red-600 sm:text-sm">
                {error}
              </p>
            ) : null}

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-900">DM Reply Mode</p>

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
                    AI Reply
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
                    Template Reply
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700">
                Instagram Account
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
                  {loadingClients
                    ? "Loading Instagram accounts..."
                    : availableClients.length > 0
                    ? "Select account"
                    : clientsFetchFailed
                    ? "Unable to load accounts"
                    : "No Instagram account connected"}
                </option>

                {availableClients.map((client) => (
                  <option
                    key={client.clientId || client.pageId || client.igUserId}
                    value={client.clientId || ""}
                  >
                    {client.name || client.igUserId || client.pageId}
                  </option>
                ))}
              </select>

              {!loadingClients && availableClients.length === 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    {clientsFetchFailed
                      ? "We couldn't load connected Instagram accounts right now."
                      : "No Instagram account connected"}
                  </span>

                  {clientsFetchFailed ? (
                    <button
                      type="button"
                      onClick={() => void fetchInstagramAccounts()}
                      className="font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {clientId ? (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  Post / Reel
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
                Trigger Keyword
              </label>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="price, cost, fees"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700">
                Public Comment Reply
              </label>

              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Thanks! I've sent you a DM."
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {replyMode === "AI" ? (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  AI DM Instruction
                </label>

                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  rows={4}
                  placeholder="Answer pricing briefly, ask one qualifier, and invite the lead to continue."
                />
              </div>
            ) : (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  DM Template Reply
                </label>

                <textarea
                  value={dm}
                  onChange={(event) => setDm(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  rows={4}
                  placeholder="Write the DM to send."
                />
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
