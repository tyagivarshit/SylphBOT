"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import AutomationFlowCard, {
  type AutomationFlowCardData,
  type AutomationFlowCardStep,
} from "./AutomationFlowCard";
import ConfirmationModal from "./ConfirmationModal";
import CreateAutomationModal from "./CreateAutomationModal";
import { usePlan } from "@/hooks/usePlan";
import { useDebounce } from "@/hooks/useDebounce";
import { notify } from "@/lib/toast";
import {
  deleteAutomationFlow,
  getAutomationFlows,
  updateAutomationFlow,
} from "@/lib/automation.service";
import {
  EmptyState,
  RetryState,
  SkeletonCard,
} from "@/components/ui/feedback";

type AutomationStepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";

type StepMetadata = {
  message?: string | null;
  condition?: string | null;
  delay?: number;
  replyMode?: "AI" | "TEMPLATE";
  aiPrompt?: string | null;
  [key: string]: unknown;
};

type AutomationUpdateStep = {
  type: AutomationStepType;
  config: {
    message?: string;
    condition?: string;
    delay?: number;
    replyMode?: "AI" | "TEMPLATE";
    aiPrompt?: string;
  };
};

type AutomationStep = AutomationFlowCardStep & {
  nextStep?: string | null;
  metadata?: StepMetadata | null;
};

type AutomationFlow = AutomationFlowCardData & {
  steps?: AutomationStep[];
};

const sanitizeText = (value?: string | null) =>
  value?.replace("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¹Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹", "").trim() || "";

const normalizeAutomationSteps = (steps?: AutomationStep[] | null) =>
  Array.isArray(steps) ? steps.filter(Boolean) : [];

const normalizeAutomationFlow = (flow: AutomationFlow): AutomationFlow => ({
  ...flow,
  steps: normalizeAutomationSteps(flow?.steps),
});

const normalizeAutomationFlows = (items?: AutomationFlow[] | null) =>
  Array.isArray(items)
    ? items
        .filter((item): item is AutomationFlow => Boolean(item?.id))
        .map(normalizeAutomationFlow)
    : [];

const normalizeStepType = (
  value?: string | null
): AutomationStepType | null => {
  switch ((value || "").toUpperCase()) {
    case "MESSAGE":
    case "DELAY":
    case "CONDITION":
    case "BOOKING":
      return value!.toUpperCase() as AutomationStepType;
    default:
      return null;
  }
};

const mapStepToPayload = (step: AutomationStep): AutomationUpdateStep | null => {
  const type = normalizeStepType(step.stepType);

  if (!type) {
    return null;
  }

  const metadata = step.metadata || {};
  const replyMode =
    metadata.replyMode === "AI" || Boolean(sanitizeText(metadata.aiPrompt))
      ? "AI"
      : "TEMPLATE";

  return {
    type,
    config: {
      ...(sanitizeText(metadata.message ?? step.message)
        ? { message: sanitizeText(metadata.message ?? step.message) }
        : {}),
      ...(sanitizeText(metadata.condition ?? step.condition)
        ? { condition: sanitizeText(metadata.condition ?? step.condition) }
        : {}),
      ...(typeof metadata.delay === "number" && metadata.delay > 0
        ? { delay: metadata.delay }
        : {}),
      ...(type === "MESSAGE" ? { replyMode } : {}),
      ...(sanitizeText(metadata.aiPrompt)
        ? { aiPrompt: sanitizeText(metadata.aiPrompt) }
        : {}),
    },
  };
};

const sortAutomations = (items: AutomationFlow[]) =>
  [...normalizeAutomationFlows(items)].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();

    return rightTime - leftTime;
  });

export default function AutomationList() {
  const { plan } = usePlan();
  const [open, setOpen] = useState(false);
  const [automations, setAutomations] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeAutomation, setActiveAutomation] = useState<AutomationFlow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AutomationFlow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const modalPlan =
    plan === "ELITE" ? "ELITE" : plan === "PRO" ? "PRO" : "BASIC";
  const debouncedSearch = useDebounce(search, 180);

  const safeAutomations = useMemo(
    () => normalizeAutomationFlows(automations),
    [automations]
  );

  const flowStats = useMemo(() => {
    const activeCount = safeAutomations.filter(
      (flow) => (flow.status || "ACTIVE").toUpperCase() === "ACTIVE"
    ).length;

    return {
      total: safeAutomations.length,
      active: activeCount,
      paused: safeAutomations.length - activeCount,
    };
  }, [safeAutomations]);

  const filteredAutomations = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    if (!query) {
      return safeAutomations;
    }

    return safeAutomations.filter((automation) => {
      const stepSummary = normalizeAutomationSteps(automation?.steps)
        .map(
          (step) =>
            `${step.stepType || ""} ${step.message || ""} ${step.condition || ""}`
        )
        .join(" ")
        .toLowerCase();

      return [
        automation.name,
        automation.triggerValue,
        automation.channel,
        automation.status,
        stepSummary,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [safeAutomations, debouncedSearch]);

  const fetchAutomations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const items = await getAutomationFlows();

      setAutomations(sortAutomations(items));
    } catch (fetchError) {
      console.error("Automation list fetch failed", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "We couldn't load your automations."
      );
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAutomations();
  }, [fetchAutomations]);

  const handleSaved = (savedAutomation: AutomationFlow) => {
    const normalizedAutomation = normalizeAutomationFlow(savedAutomation);

    setAutomations((current) => {
      const exists = current.some(
        (automation) => automation.id === normalizedAutomation.id
      );

      if (!exists) {
        return sortAutomations([normalizedAutomation, ...current]);
      }

      return sortAutomations(
        current.map((automation) =>
          automation.id === normalizedAutomation.id
            ? {
                ...automation,
                ...normalizedAutomation,
                steps: normalizedAutomation.steps || automation.steps,
              }
            : automation
        )
      );
    });
  };

  const buildUpdatePayload = (automation: AutomationFlow, status?: string) => {
    const steps = normalizeAutomationSteps(automation?.steps)
      .map(mapStepToPayload)
      .filter((step): step is AutomationUpdateStep => step !== null);

    if (!automation.name?.trim() || !automation.triggerValue?.trim() || !steps.length) {
      return null;
    }

    return {
      name: automation.name.trim(),
      triggerValue: automation.triggerValue.trim().toLowerCase(),
      triggerType: automation.triggerType || "KEYWORD",
      channel: automation.channel || "INSTAGRAM",
      status: status || automation.status || "ACTIVE",
      steps,
    };
  };

  const handleToggle = async (automation: AutomationFlow) => {
    if (!automation?.id) {
      notify.error("This automation is missing data required to update it.");
      return;
    }

    const nextStatus =
      (automation.status || "ACTIVE").toUpperCase() === "ACTIVE"
        ? "INACTIVE"
        : "ACTIVE";
    const payload = buildUpdatePayload(automation, nextStatus);

    if (!payload) {
      notify.error("This automation is missing data required to update it.");
      return;
    }

    try {
      setTogglingId(automation.id);

      const data = await updateAutomationFlow(automation.id, payload);

      if (data?.success === false) {
        throw new Error(
          data.message ||
            (nextStatus === "ACTIVE"
              ? "We couldn't activate this automation."
              : "We couldn't pause this automation.")
        );
      }

      handleSaved(
        (data?.flow as AutomationFlow | undefined) || {
          ...automation,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        }
      );

      notify.success(
        nextStatus === "ACTIVE" ? "Automation activated" : "Automation paused"
      );
    } catch (toggleError) {
      notify.error(
        toggleError instanceof Error
          ? toggleError.message
          : "We couldn't update this automation."
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete?.id) {
      return;
    }

    try {
      setDeletingId(pendingDelete.id);

      const data = await deleteAutomationFlow(pendingDelete.id);

      if (data?.success === false) {
        throw new Error(data?.message || "We couldn't delete this automation.");
      }

      setAutomations((current) =>
        current.filter((automation) => automation.id !== pendingDelete.id)
      );
      notify.success("Automation deleted");
      setPendingDelete(null);
    } catch (deleteError) {
      notify.error(
        deleteError instanceof Error
          ? deleteError.message
          : "We couldn't delete this automation."
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white">
            {flowStats.total} total
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
            {flowStats.active} active
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            {flowStats.paused} paused
          </span>
          <button
            onClick={() => {
              setActiveAutomation(null);
              setOpen(true);
            }}
            className="brand-button-primary"
          >
            Create Automation
          </button>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search automations"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} className="h-56" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <RetryState
          title="Automation list unavailable"
          description={error}
          onRetry={() => void fetchAutomations()}
        />
      ) : null}

      {!loading && !error && safeAutomations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          actionLabel="Create automation"
          onAction={() => {
            setActiveAutomation(null);
            setOpen(true);
          }}
        />
      ) : null}

      {!loading && !error && safeAutomations.length > 0 && filteredAutomations.length === 0 ? (
        <EmptyState
          title="No results"
        />
      ) : null}

      {!loading && !error && filteredAutomations.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAutomations.map((automation) => (
            <AutomationFlowCard
              key={automation.id}
              automation={automation}
              isToggling={togglingId === automation.id}
              isDeleting={deletingId === automation.id}
              onEdit={(selected) => {
                setActiveAutomation(selected);
                setOpen(true);
              }}
              onToggle={(selected) => void handleToggle(selected)}
              onDelete={(selected) => setPendingDelete(selected)}
            />
          ))}
        </div>
      ) : null}

      <CreateAutomationModal
        open={open}
        plan={modalPlan}
        initialData={activeAutomation}
        onSaved={handleSaved}
        onClose={() => {
          setOpen(false);
          setActiveAutomation(null);
        }}
      />

      <ConfirmationModal
        open={Boolean(pendingDelete)}
        title="Delete automation?"
        description="This will permanently remove the automation from your workspace and stop future replies from this flow."
        confirmLabel="Delete automation"
        confirmTone="danger"
        loading={deletingId === pendingDelete?.id}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
