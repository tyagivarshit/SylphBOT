"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  buildApiUrl,
  buildAppUrl,
  fetchWorkspaceApiKey,
} from "@/lib/userApi";

type ClientConnection = {
  id: string;
  platform: string;
};

export default function IntegrationsSettings() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [connecting, setConnecting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/clients"), {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load integrations");
      }

      return (await res.json()) as ClientConnection[];
    },
  });

  const clients = data || [];
  const whatsapp = clients.find((client) => client.platform === "WHATSAPP");
  const instagram = clients.find((client) => client.platform === "INSTAGRAM");

  useEffect(() => {
    const status = params.get("integration");

    if (status === "success") {
      toast.success("Integration connected successfully");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      window.history.replaceState({}, "", buildAppUrl("/settings"));
    }

    if (status === "error") {
      toast.error("Integration failed");
      window.history.replaceState({}, "", buildAppUrl("/settings"));
    }
  }, [params, queryClient]);

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(buildApiUrl(`/api/clients/${id}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Disconnect failed");
      }

      return res.json();
    },
    onSuccess: async () => {
      toast.success("Disconnected successfully");
      await queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => {
      toast.error("Unable to disconnect right now");
    },
  });

  const connectMeta = async () => {
    try {
      setConnecting("meta");

      const res = await fetch(buildApiUrl("/api/clients/oauth/meta"), {
        credentials: "include",
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.url) {
        throw new Error(payload?.message || "Failed to start connection");
      }

      window.location.assign(payload.url);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setConnecting(null);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500 animate-pulse">Loading...</div>;
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 space-y-6 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Integrations</h3>
        <p className="text-sm text-gray-500 mt-1">
          Connect your external platforms
        </p>
      </div>

      <IntegrationCard
        title="WhatsApp"
        desc="Connect WhatsApp Business API"
        connected={Boolean(whatsapp)}
        loading={connecting === "meta"}
        onConnect={connectMeta}
        onDisconnect={() => whatsapp && disconnect.mutate(whatsapp.id)}
      />

      <IntegrationCard
        title="Instagram"
        desc="Connect Instagram messaging and comments"
        connected={Boolean(instagram)}
        loading={connecting === "meta"}
        onConnect={connectMeta}
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
  loading,
  onConnect,
  onDisconnect,
}: {
  title: string;
  desc: string;
  connected: boolean;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 flex items-center justify-between hover:shadow-md transition">
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>

      {connected ? (
        <button
          onClick={onDisconnect}
          className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-md transition"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-lg transition"
        >
          {loading ? "Connecting..." : "Connect"}
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
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">API Key</p>
        <p className="text-xs text-gray-500">Use this key to access API</p>
      </div>

      <div className="flex items-center justify-between bg-white border border-blue-100 rounded-xl px-4 py-2.5 gap-3">
        <span className="text-sm text-gray-700 truncate">
          {isError ? "Unable to load workspace API key" : maskedKey}
        </span>

        <button
          onClick={handleCopy}
          disabled={!apiKey || isLoading}
          className="text-xs font-semibold bg-blue-50 text-gray-700 px-3 py-1.5 rounded-lg hover:shadow-sm transition disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Copy"}
        </button>
      </div>
    </div>
  );
}

