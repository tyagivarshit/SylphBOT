"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import ConfirmationModal from "@/components/automation/ConfirmationModal";
import CommentAutomationCard from "./CommentAutomationCard";
import CreateCommentAutomationModal from "./CreateCommentAutomationModal";
import { notify } from "@/lib/toast";

type CommentAutomation = {
  id: string;
  keyword?: string | null;
  replyText?: string | null;
  dmText?: string | null;
  aiPrompt?: string | null;
  clientId?: string | null;
  reelId?: string | null;
  isActive?: boolean;
  triggerCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastTriggeredAt?: string | null;
};

const sortAutomations = (items: CommentAutomation[]) =>
  [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();

    return rightTime - leftTime;
  });

export default function CommentAutomationList() {
  const [open, setOpen] = useState(false);
  const [automations, setAutomations] = useState<CommentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchFailed, setFetchFailed] = useState(false);
  const [editData, setEditData] = useState<CommentAutomation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommentAutomation | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const activeCount = automations.filter((automation) => automation.isActive).length;

    return {
      total: automations.length,
      active: activeCount,
      paused: automations.length - activeCount,
    };
  }, [automations]);

  const fetchTriggers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setFetchFailed(false);

      console.log("Fetching comment automation triggers");

      const response = await api.get("/comment-automation/triggers");
      const data = Array.isArray(response.data)
        ? (response.data as CommentAutomation[])
        : ((response.data?.triggers || []) as CommentAutomation[]);

      console.log("Comment automation triggers fetched:", data);
      setAutomations(sortAutomations(data));
    } catch (fetchError) {
      console.error("Comment automation triggers fetch failed", fetchError);
      setAutomations([]);
      setFetchFailed(true);
      setError("We couldn't refresh your comment automations right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTriggers();
  }, [fetchTriggers]);

  const handleSaved = (savedAutomation: CommentAutomation) => {
    setAutomations((current) => {
      const exists = current.some((automation) => automation.id === savedAutomation.id);

      if (!exists) {
        return sortAutomations([savedAutomation, ...current]);
      }

      return sortAutomations(
        current.map((automation) =>
          automation.id === savedAutomation.id
            ? {
                ...automation,
                ...savedAutomation,
              }
            : automation
        )
      );
    });
  };

  const handleToggle = async (automation: CommentAutomation) => {
    try {
      setTogglingId(automation.id);

      const response = await api.patch(`/comment-triggers/${automation.id}/toggle`);
      const updated = (response.data?.trigger as CommentAutomation | undefined) || {
        ...automation,
        isActive: !automation.isActive,
        updatedAt: new Date().toISOString(),
      };

      handleSaved(updated);
      notify.success(updated.isActive ? "Trigger activated" : "Trigger paused");
    } catch (toggleError) {
      console.error(toggleError);
      notify.error("We couldn't update this trigger yet.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    try {
      setDeletingId(pendingDelete.id);
      await api.delete(`/comment-triggers/${pendingDelete.id}`);

      setAutomations((current) =>
        current.filter((automation) => automation.id !== pendingDelete.id)
      );
      notify.success("Comment automation deleted");
      setPendingDelete(null);
    } catch (deleteError) {
      console.error(deleteError);
      notify.error("We couldn't delete this trigger.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white">
            {stats.total} total
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
            {stats.active} active
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            {stats.paused} paused
          </span>
          <button
            onClick={() => {
              setEditData(null);
              setOpen(true);
            }}
            className="brand-button-primary w-full sm:w-auto"
          >
            Create Automation
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-[24px] border border-slate-200 bg-white/80 shadow-sm"
            />
          ))}
        </div>
      ) : null}

      {!loading && !automations.length ? (
        <div className="brand-empty-state rounded-[24px] p-8 text-center">
          <p className="text-base font-semibold text-gray-900">
            {fetchFailed ? "Automation list unavailable" : "No automations yet"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {fetchFailed
              ? error || "We couldn't refresh your comment automations right now."
              : "Create your first Instagram comment automation."}
          </p>

          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {fetchFailed ? (
              <button
                onClick={() => void fetchTriggers()}
                className="brand-button-secondary w-full sm:w-auto"
              >
                Retry
              </button>
            ) : null}

            <button
              onClick={() => {
                setEditData(null);
                setOpen(true);
              }}
              className="brand-button-primary w-full sm:w-auto"
            >
              Create one
            </button>
          </div>
        </div>
      ) : null}

      {!loading && automations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {automations.map((automation) => (
            <CommentAutomationCard
              key={automation.id}
              automation={automation}
              isToggling={togglingId === automation.id}
              isDeleting={deletingId === automation.id}
              onEdit={(selected) => {
                setEditData(selected);
                setOpen(true);
              }}
              onToggle={(selected) => void handleToggle(selected)}
              onDelete={(selected) => setPendingDelete(selected)}
            />
          ))}
        </div>
      ) : null}

      <CreateCommentAutomationModal
        open={open}
        editData={editData}
        onSaved={handleSaved}
        onClose={() => {
          setOpen(false);
          setEditData(null);
        }}
      />

      <ConfirmationModal
        open={Boolean(pendingDelete)}
        title="Delete comment automation?"
        description="This removes the trigger from your automation list. This action cannot be undone."
        confirmLabel="Delete Trigger"
        confirmTone="danger"
        loading={deletingId === pendingDelete?.id}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
