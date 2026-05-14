"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { apiFetch } from "@/lib/apiClient"
import { fetchClientConnectionStatus } from "@/lib/userApi"

const defaultConnections = {
  instagram: {
    connected: false,
    healthy: false,
  },
  whatsapp: {
    connected: false,
    healthy: false,
  },
}

export default function AddClientModal({ onClose, onConnected }: any) {
  const [connections, setConnections] = useState(defaultConnections)
  const [connecting, setConnecting] = useState<string | null>(null)

  const loadConnections = async () => {
    try {
      const status = await fetchClientConnectionStatus()

      setConnections({
        instagram: {
          connected: Boolean(status.instagram.connected),
          healthy: Boolean(status.instagram.healthy),
        },
        whatsapp: {
          connected: Boolean(status.whatsapp.connected),
          healthy: Boolean(status.whatsapp.healthy),
        },
      })
    } catch (error) {
      console.error("Connection status error", error)
      setConnections(defaultConnections)
    }
  }

  useEffect(() => {
    void loadConnections()
  }, [])

  const connectMeta = async (platformKey: "instagram" | "whatsapp") => {
    if (
      (platformKey === "instagram" &&
        connections.instagram.connected &&
        connections.instagram.healthy) ||
      (platformKey === "whatsapp" &&
        connections.whatsapp.connected &&
        connections.whatsapp.healthy)
    ) {
      return
    }

    try {
      setConnecting(platformKey)
      const query = new URLSearchParams({
        platform: platformKey.toUpperCase(),
        mode: "connect",
      })
      const response = await apiFetch<{ url?: string }>(
        `/api/clients/oauth/meta?${query.toString()}`,
        {
          credentials: "include",
        }
      )

      if (!response.success || !response.data?.url) {
        throw new Error(response.message || "Failed to start connection")
      }

      await onConnected?.()
      window.location.assign(response.data.url)
    } catch (err) {
      console.error(`${platformKey} connect error`, err)
      setConnecting(null)
    }
  }

  const connectWhatsApp = () => {
    void connectMeta("whatsapp")
  }

  const connectInstagram = () => {
    void connectMeta("instagram")
  }

  const whatsappLabel = connections.whatsapp.connected
    ? connections.whatsapp.healthy
      ? "Connected ✅"
      : "Reconnect"
    : connecting === "whatsapp"
      ? "Connecting..."
      : "Connect"

  const instagramLabel = connections.instagram.connected
    ? connections.instagram.healthy
      ? "Connected ✅"
      : "Reconnect"
    : connecting === "instagram"
      ? "Connecting..."
      : "Connect"

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl w-full max-w-md border border-blue-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100">
          <h2 className="text-base font-semibold text-gray-900">
            Connect Platform
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-blue-50 transition"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-gray-500">
            Connect your messaging platforms to enable AI automation.
          </p>

          <div className="space-y-3">
            <button
              onClick={connectWhatsApp}
              disabled={
                (connections.whatsapp.connected && connections.whatsapp.healthy) ||
                connecting === "whatsapp"
              }
              className="w-full border border-blue-100 hover:shadow-md transition p-4 rounded-2xl flex items-center justify-between group bg-white/70 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-semibold">
                  W
                </div>

                <div className="flex flex-col items-start">
                  <span className="font-semibold text-gray-900 text-sm">
                    WhatsApp
                  </span>

                  <span className="text-xs text-gray-500">
                    Connect WhatsApp Business
                  </span>
                </div>
              </div>

              <span className="text-sm font-semibold text-blue-600 opacity-70 group-hover:opacity-100">
                {whatsappLabel}
              </span>
            </button>

            <button
              onClick={connectInstagram}
              disabled={
                (connections.instagram.connected && connections.instagram.healthy) ||
                connecting === "instagram"
              }
              className="w-full border border-blue-100 hover:shadow-md transition p-4 rounded-2xl flex items-center justify-between group bg-white/70 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-semibold">
                  I
                </div>

                <div className="flex flex-col items-start">
                  <span className="font-semibold text-gray-900 text-sm">
                    Instagram
                  </span>

                  <span className="text-xs text-gray-500">
                    Connect Instagram DMs
                  </span>
                </div>
              </div>

              <span className="text-sm font-semibold text-blue-600 opacity-70 group-hover:opacity-100">
                {instagramLabel}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-blue-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-gray-700 hover:bg-blue-100 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
