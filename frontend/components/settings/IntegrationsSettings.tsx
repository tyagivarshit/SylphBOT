"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";

const API_URL = "http://localhost:5000";

export default function IntegrationsSettings() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();

  const [connecting, setConnecting] = useState<string | null>(null);

  /* =========================
     🔥 FETCH CONNECTIONS
  ========================= */
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/clients`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed");

      return res.json();
    },
  });

  const clients = data || [];

  const whatsapp = clients.find((c: any) => c.platform === "WHATSAPP");
  const instagram = clients.find((c: any) => c.platform === "INSTAGRAM");

  /* =========================
     🔥 TOAST + AUTO REFRESH
  ========================= */
  useEffect(() => {
    const status = params.get("integration");

    if (status === "success") {
      toast.success("Integration connected successfully 🚀");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      router.replace("/settings");
    }

    if (status === "error") {
      toast.error("Integration failed ❌");
      router.replace("/settings");
    }
  }, [params]);

  /* =========================
     🔥 DISCONNECT
  ========================= */
  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/api/clients/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed");

      return res.json();
    },
    onSuccess: async () => {
      toast.success("Disconnected successfully");
      await queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  /* =========================
     🔥 CONNECT (FIXED FLOW)
  ========================= */
  const connectMeta = async () => {
    try {
      setConnecting("meta");

      const res = await fetch(`${API_URL}/api/clients/oauth/meta`, {
        credentials: "include",
      });

      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to start connection");
        setConnecting(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      setConnecting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500 animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 space-y-6 shadow-sm">

      {/* HEADER */}
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Integrations
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Connect your external platforms
        </p>
      </div>

      {/* WHATSAPP */}
      <IntegrationCard
        title="WhatsApp"
        desc="Connect WhatsApp Business API"
        connected={!!whatsapp}
        loading={connecting === "meta"}
        onConnect={connectMeta}
        onDisconnect={() => disconnect.mutate(whatsapp.id)}
      />

      {/* INSTAGRAM */}
      <IntegrationCard
        title="Instagram"
        desc="Connect Instagram messaging & comments"
        connected={!!instagram}
        loading={connecting === "meta"}
        onConnect={connectMeta}
        onDisconnect={() => disconnect.mutate(instagram.id)}
      />

      {/* API KEY */}
      <ApiKeySection />

    </div>
  );
}

/* =========================
   🔥 CARD
========================= */
function IntegrationCard({
  title,
  desc,
  connected,
  loading,
  onConnect,
  onDisconnect,
}: any) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 flex items-center justify-between hover:shadow-md transition">

      <div>
        <p className="text-sm font-semibold text-gray-900">
          {title}
        </p>
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

/* =========================
   🔥 API KEY SECTION
========================= */
function ApiKeySection() {
  const apiKey = "sk_live_xxxxxxxxxxxxxx";

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 space-y-4">

      <div>
        <p className="text-sm font-semibold text-gray-900">
          API Key
        </p>
        <p className="text-xs text-gray-500">
          Use this key to access API
        </p>
      </div>

      <div className="flex items-center justify-between bg-white border border-blue-100 rounded-xl px-4 py-2.5">

        <span className="text-sm text-gray-700 truncate">
          {apiKey}
        </span>

        <button
          onClick={() => navigator.clipboard.writeText(apiKey)}
          className="text-xs font-semibold bg-blue-50 text-gray-700 px-3 py-1.5 rounded-lg hover:shadow-sm transition"
        >
          Copy
        </button>

      </div>

    </div>
  );
}