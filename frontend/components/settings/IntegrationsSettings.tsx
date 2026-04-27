"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { apiFetch } from "@/lib/apiClient";
import {
  buildAppUrl,
  fetchClientConnectionStatus,
  fetchWorkspaceApiKey,
} from "@/lib/userApi";
import { getClients } from "@/lib/clients";

type ClientConnection = {
  id: string;
  platform: string;
};

const defaultConnections = {
  instagram: {
    connected: false,
    healthy: false,
  },
  whatsapp: {
    connected: false,
    healthy: false,
  },
};

export default function IntegrationsSettings() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connections, setConnections] = useState(defaultConnections);

  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => (await getClients()) as ClientConnection[],
  });

  const clients = Array.isArray(data) ? data : [];
  const whatsapp = clients.find((client) => client.platform === "WHATSAPP");
  const instagram = clients.find((client) => client.platform === "INSTAGRAM");

  const loadConnections = useCallback(async () => {
    try {
      const status = await fetchClientConnectionStatus();
      const instagramStatus = status?.instagram || null;
      const whatsappStatus = status?.whatsapp || null;

      setConnections({
        instagram: {
          connected: Boolean(instagramStatus?.connected),
          healthy: Boolean(instagramStatus?.healthy),
        },
        whatsapp: {
          connected: Boolean(whatsappStatus?.connected),
          healthy: Boolean(whatsappStatus?.healthy),
        },
      });
    } catch (error) {
      console.error("Connection status error", error);
      setConnections(defaultConnections);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const status = params.get("integration");

    const syncAfterConnect = async () => {
      if (status === "success") {
        toast.success("Integration connected successfully");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["integrations"] }),
          loadConnections(),
        ]);
        window.history.replaceState({}, "", buildAppUrl("/settings"));
        return;
      }

      if (status === "error") {
        toast.error("Integration failed");
        await loadConnections();
        window.history.replaceState({}, "", buildAppUrl("/settings"));
      }
    };

    void syncAfterConnect();
  }, [loadConnections, params, queryClient]);

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/clients/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.success) {
        throw new Error(response.message || "Disconnect failed");
      }

      return response.data;
    },
    onSuccess: async () => {
      toast.success("Disconnected successfully");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["integrations"] }),
        loadConnections(),
      ]);
    },
    onError: () => {
      toast.error("Unable to disconnect right now");
    },
  });

  const connectMeta = async (
    platformKey: "instagram" | "whatsapp",
    mode: "connect" | "reconnect" = "connect"
  ) => {
    try {
      setConnecting(platformKey);

      const query = new URLSearchParams({
        platform: platformKey.toUpperCase(),
        mode,
      });
      const response = await apiFetch<{ url?: string }>(
        `/api/clients/oauth/meta?${query.toString()}`,
        {
          credentials: "include",
        }
      );

      if (!response.success || !response.data?.url) {
        throw new Error(response.message || "Failed to start connection");
      }

      window.location.assign(response.data.url);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setConnecting(null);
    }
  };

  const reconnectPlatform = async (
    platformKey: "instagram" | "whatsapp",
    _clientId?: string
  ) => {
    try {
      await connectMeta(platformKey, "reconnect");
    } catch (error) {
      console.error("Reconnect error", error);
      toast.error("Unable to reconnect right now");
      setConnecting(null);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500 animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Connection status</h3>
        <p className="text-sm text-gray-500 mt-1">
          Connect your external platforms and keep access synced.
        </p>
      </div>

      <IntegrationCard
        title="WhatsApp"
        desc="Connect WhatsApp Business API"
        connected={connections.whatsapp.connected}
        healthy={connections.whatsapp.healthy}
        loading={connecting === "whatsapp"}
        onConnect={() => connectMeta("whatsapp")}
        onReconnect={() => reconnectPlatform("whatsapp", whatsapp?.id)}
        onDisconnect={() => whatsapp && disconnect.mutate(whatsapp.id)}
      />

      <IntegrationCard
        title="Instagram"
        desc="Connect Instagram messaging and comments"
        connected={connections.instagram.connected}
        healthy={connections.instagram.healthy}
        loading={connecting === "instagram"}
        onConnect={() => connectMeta("instagram")}
        onReconnect={() => reconnectPlatform("instagram", instagram?.id)}
        onDisconnect={() => instagram && disconnect.mutate(instagram.id)}
      />

      <ApiKeySection />
    </div>
  );
}

function IntegrationCard({
  title,
  desc,
  connected,
  healthy,
  loading,
  onConnect,
  onReconnect,
  onDisconnect,
}: {
  title: string;
  desc: string;
  connected: boolean;
  healthy: boolean;
  loading: boolean;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[24px] border border-slate-200/80 bg-white/84 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>

      {connected && healthy ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
          >
            Connected ✅
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:shadow-md"
          >
            Disconnect
          </button>
        </div>
      ) : connected ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700"
          >
            Connection expired ⚠️
          </button>
          <button
            type="button"
            onClick={onReconnect}
            disabled={loading}
            className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:shadow-md disabled:opacity-60"
          >
            {loading ? "Connecting..." : "Reconnect"}
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          className="brand-button-primary px-4 py-2"
        >
          {loading ? "Connecting..." : `Connect ${title}`}
        </button>
      )}
    </div>
  );
}

function ApiKeySection() {
  const { data: apiKey, isLoading, isError } = useQuery({
    queryKey: ["workspace-api-key"],
    queryFn: fetchWorkspaceApiKey,
  });

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 12)}${"*".repeat(10)}${apiKey.slice(-6)}`
    : "Loading workspace key...";

  const handleCopy = async () => {
    if (!apiKey) {
      return;
    }

    await navigator.clipboard.writeText(apiKey);
    toast.success("API key copied");
  };

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/84 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">API Key</p>
        <p className="text-xs text-gray-500">Use this key to access API</p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm text-gray-700 truncate">
          {isError ? "Unable to load workspace API key" : maskedKey}
        </span>

        <button
          onClick={handleCopy}
          disabled={!apiKey || isLoading}
          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:shadow-sm disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Copy"}
        </button>
      </div>
    </div>
  );
}
