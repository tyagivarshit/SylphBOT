"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import ConfirmationModal from "@/components/automation/ConfirmationModal";
import {
  createSecurityApiKey,
  fetchSecurityApiKeys,
  isSecurityRequestError,
  revokeSecurityApiKey,
  rotateSecurityApiKey,
  type ApiKeySecret,
  type ApiKeySummary,
} from "@/lib/security";
import { notify } from "@/lib/toast";
import ApiKeyRevealModal from "./ApiKeyRevealModal";
import CreateApiKeyModal from "./CreateApiKeyModal";
import {
  formatDateTime,
  formatKeyName,
  formatRoleLabel,
} from "./securityUtils";
import { TrustSignals } from "@/components/ui/feedback";

type PendingAction =
  | {
      type: "rotate";
      apiKey: ApiKeySummary;
    }
  | {
      type: "revoke";
      apiKey: ApiKeySummary;
    };

type RevealedKeyState = {
  mode: "created" | "rotated";
  apiKey: ApiKeySecret;
} | null;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const EMPTY_API_KEYS: ApiKeySummary[] = [];

export default function ApiKeysTab() {
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [revealedKey, setRevealedKey] = useState<RevealedKeyState>(null);

  const apiKeysQuery = useQuery({
    queryKey: ["security", "api-keys"],
    queryFn: fetchSecurityApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createSecurityApiKey,
    onSuccess: async (apiKey) => {
      notify.success("API key created");
      setCreateModalOpen(false);
      setRevealedKey({
        mode: "created",
        apiKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["security", "api-keys"],
      });
    },
    onError: (error) => {
      notify.error(getErrorMessage(error, "Failed to create API key"));
    },
  });

  const rotateMutation = useMutation({
    mutationFn: rotateSecurityApiKey,
    onSuccess: async (apiKey) => {
      notify.success("API key rotated");
      setPendingAction(null);
      setRevealedKey({
        mode: "rotated",
        apiKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["security", "api-keys"],
      });
    },
    onError: (error) => {
      notify.error(getErrorMessage(error, "Failed to rotate API key"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSecurityApiKey,
    onSuccess: async () => {
      notify.success("API key revoked");
      setPendingAction(null);
      await queryClient.invalidateQueries({
        queryKey: ["security", "api-keys"],
      });
    },
    onError: (error) => {
      notify.error(getErrorMessage(error, "Failed to revoke API key"));
    },
  });

  const accessDenied = Boolean(
    apiKeysQuery.error &&
    isSecurityRequestError(apiKeysQuery.error) &&
    apiKeysQuery.error.status === 403
  );

  const apiKeys = apiKeysQuery.data ?? EMPTY_API_KEYS;
  const adminKeys = useMemo(
    () => apiKeys.filter((apiKey) => apiKey.scopes.includes("ADMIN")).length,
    [apiKeys]
  );

  const handleConfirmAction = async () => {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "rotate") {
      await rotateMutation.mutateAsync(pendingAction.apiKey.id);
      return;
    }

    await revokeMutation.mutateAsync(pendingAction.apiKey.id);
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Credential lifecycle
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              API keys
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Issue, rotate, and revoke workspace credentials with a complete
              masked inventory and one-time secret reveal.
            </p>
            <TrustSignals className="mt-4" />
          </div>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            disabled={accessDenied}
            className="brand-button-primary"
          >
            <Plus size={16} />
            Create API key
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="Active keys"
            value={String(apiKeys.length)}
            detail="Workspace-scoped credentials currently active."
            icon={<KeyRound size={16} />}
          />
          <StatCard
            label="Admin scope"
            value={String(adminKeys)}
            detail="Keys with full access should stay tightly controlled."
            icon={<Shield size={16} />}
          />
          <StatCard
            label="Visibility"
            value="One-time reveal"
            detail="Secrets are only shown immediately after create or rotate."
            icon={<BadgeCheck size={16} />}
          />
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Use the least privilege required for every integration. Rotating a key
          issues a new secret and immediately revokes the previous credential.
        </div>

        {apiKeysQuery.isLoading ? <ApiKeysLoadingState /> : null}

        {accessDenied ? (
          <AccessDeniedState message="Your role can view this page, but API key management requires elevated security permissions." />
        ) : null}

        {!apiKeysQuery.isLoading && apiKeysQuery.isError && !accessDenied ? (
          <ErrorState
            message="The API key inventory could not be loaded."
            onRetry={() => void apiKeysQuery.refetch()}
          />
        ) : null}

        {!apiKeysQuery.isLoading &&
        !apiKeysQuery.isError &&
        apiKeys.length === 0 ? (
          <EmptyState
            title="No API keys issued yet"
            description="Create a dedicated key for each integration so access can be rotated and revoked independently."
            actionLabel="Create the first key"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : null}

        {!apiKeysQuery.isLoading &&
        !apiKeysQuery.isError &&
        apiKeys.length > 0 ? (
          <>
            <div className="space-y-3 lg:hidden">
              {apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="brand-panel rounded-[24px] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">
                        {formatKeyName(apiKey.name)}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">
                        {apiKey.maskedKey}
                      </p>
                    </div>

                    <ScopePills scopes={apiKey.scopes} />
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[20px] border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                    <MetadataRow
                      label="Created"
                      value={formatDateTime(apiKey.createdAt)}
                    />
                    <MetadataRow
                      label="Last used"
                      value={formatDateTime(apiKey.lastUsedAt)}
                    />
                    <MetadataRow
                      label="Issued by"
                      value={
                        apiKey.createdByUser?.email ||
                        formatRoleLabel(apiKey.role) ||
                        "System"
                      }
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "rotate",
                          apiKey,
                        })
                      }
                      disabled={
                        rotateMutation.isPending || revokeMutation.isPending
                      }
                      className="brand-button-secondary w-full"
                    >
                      <RefreshCw size={16} />
                      Rotate
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "revoke",
                          apiKey,
                        })
                      }
                      disabled={
                        rotateMutation.isPending || revokeMutation.isPending
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={16} />
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="brand-table-wrap hidden rounded-[28px] lg:block">
              <div className="overflow-x-auto">
                <table className="brand-table min-w-full text-sm">
                  <thead className="border-b border-slate-200/80">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                        Key
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                        Scopes
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                        Created
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                        Last used
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.2em]">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white/72">
                    {apiKeys.map((apiKey) => {
                      const rotating =
                        rotateMutation.isPending &&
                        rotateMutation.variables === apiKey.id;
                      const revoking =
                        revokeMutation.isPending &&
                        revokeMutation.variables === apiKey.id;

                      return (
                        <tr key={apiKey.id}>
                          <td className="px-5 py-4">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-950">
                                {formatKeyName(apiKey.name)}
                              </p>
                              <p className="mt-1 truncate font-mono text-xs text-slate-500">
                                {apiKey.maskedKey}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Issued by{" "}
                                {apiKey.createdByUser?.email ||
                                  formatRoleLabel(apiKey.role) ||
                                  "system"}
                              </p>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <ScopePills scopes={apiKey.scopes} />
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {formatDateTime(apiKey.createdAt)}
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {formatDateTime(apiKey.lastUsedAt)}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({
                                    type: "rotate",
                                    apiKey,
                                  })
                                }
                                disabled={rotating || revoking}
                                className="brand-button-secondary px-4 py-2.5 text-sm"
                              >
                                <RefreshCw
                                  size={15}
                                  className={rotating ? "animate-spin" : ""}
                                />
                                {rotating ? "Rotating..." : "Rotate"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({
                                    type: "revoke",
                                    apiKey,
                                  })
                                }
                                disabled={rotating || revoking}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 size={15} />
                                {revoking ? "Revoking..." : "Revoke"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {createModalOpen ? (
        <CreateApiKeyModal
          open={createModalOpen}
          loading={createMutation.isPending}
          onClose={() => setCreateModalOpen(false)}
          onCreate={async (input) => {
            await createMutation.mutateAsync(input);
          }}
        />
      ) : null}

      <ApiKeyRevealModal
        apiKey={revealedKey?.apiKey ?? null}
        mode={revealedKey?.mode ?? "created"}
        onClose={() => setRevealedKey(null)}
      />

      <ConfirmationModal
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === "rotate"
            ? "Rotate API key?"
            : "Revoke API key?"
        }
        description={
          pendingAction?.type === "rotate"
            ? `A new secret will be issued for ${formatKeyName(
                pendingAction.apiKey.name
              )}. The current secret will stop working immediately.`
            : `Revoke ${formatKeyName(
                pendingAction?.apiKey.name
              )} and immediately disable all requests using this credential.`
        }
        confirmLabel={
          pendingAction?.type === "rotate" ? "Rotate key" : "Revoke key"
        }
        confirmTone={pendingAction?.type === "rotate" ? "primary" : "danger"}
        loading={rotateMutation.isPending || revokeMutation.isPending}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void handleConfirmAction()}
      />
    </>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="brand-kpi-card rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function ScopePills({ scopes }: { scopes: ApiKeySummary["scopes"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
        >
          {scope}
        </span>
      ))}
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="text-right text-sm text-slate-700">{value}</span>
    </div>
  );
}

function ApiKeysLoadingState() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="brand-panel animate-pulse rounded-[24px] p-5"
        >
          <div className="h-5 w-40 rounded-full bg-slate-200" />
          <div className="mt-3 h-4 w-56 rounded-full bg-slate-100" />
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            <div className="h-10 rounded-[18px] bg-slate-100" />
            <div className="h-10 rounded-[18px] bg-slate-100" />
            <div className="h-10 rounded-[18px] bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AccessDeniedState({ message }: { message: string }) {
  return (
    <div className="brand-empty-state rounded-[28px] px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-900">Access limited</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="brand-empty-state rounded-[28px] px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-900">{message}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Try again to reload the latest credential inventory.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="brand-button-secondary mt-5"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="brand-empty-state rounded-[28px] px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="brand-button-primary mt-5"
      >
        {actionLabel}
      </button>
    </div>
  );
}
