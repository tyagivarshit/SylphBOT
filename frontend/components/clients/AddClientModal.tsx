"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import MetaOAuthPrecheckModal, {
  getMetaOAuthPrecheckDismissed,
  type MetaOAuthPlatform,
} from "@/components/integrations/MetaOAuthPrecheckModal"
import { apiFetch } from "@/lib/apiClient"
import { apiClient } from "@/lib/apiClient"
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

type AddClientModalProps = {
  onClose: () => void
  onConnected?: () => void | Promise<void>
}

type MetaEmbeddedSignupConfig = {
  appId: string
  configId: string
  graphVersion?: string
  responseType?: "code"
  overrideDefaultResponseType?: boolean
  extras?: Record<string, unknown>
}

type MetaStartResponse = {
  url?: string
  state?: string
  platform?: string
  mode?: string
  embeddedSignup?: MetaEmbeddedSignupConfig | null
}

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void
      login: (
        callback: (response: {
          authResponse?: { code?: string | null } | null
          status?: string
        }) => void,
        options?: Record<string, unknown>
      ) => void
    }
  }
}

export default function AddClientModal({
  onClose,
  onConnected,
}: AddClientModalProps) {
  const [connections, setConnections] = useState(defaultConnections)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [precheckPlatform, setPrecheckPlatform] =
    useState<MetaOAuthPlatform | null>(null)

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

  const waitForFacebookSdk = async () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (typeof window !== "undefined" && window.FB) {
        return window.FB
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    return null
  }

  const getLifecycleOperationId = (payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return null
    }
    const root = payload as Record<string, unknown>
    const data =
      root.data && typeof root.data === "object"
        ? (root.data as Record<string, unknown>)
        : root
    const lifecycle =
      data.lifecycle && typeof data.lifecycle === "object"
        ? (data.lifecycle as Record<string, unknown>)
        : data
    return String(lifecycle.operationId || data.operationId || "").trim() || null
  }

  const openCallbackLifecycle = ({
    state,
    operationId,
    mode,
  }: {
    state: string
    operationId?: string | null
    mode?: string | null
  }) => {
    const query = new URLSearchParams({
      state,
      platform: "whatsapp",
      mode: mode || "connect",
    })
    if (operationId) {
      query.set("operationId", operationId)
    }
    window.location.assign(`/integrations/meta/callback?${query.toString()}`)
  }

  const launchWhatsAppEmbeddedSignup = async (start: MetaStartResponse) => {
    const embeddedSignup = start.embeddedSignup
    if (!embeddedSignup?.appId || !embeddedSignup.configId || !start.state) {
      return false
    }

    const facebookSdk = await waitForFacebookSdk()
    if (!facebookSdk) {
      return false
    }

    facebookSdk.init({
      appId: embeddedSignup.appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: embeddedSignup.graphVersion || "v19.0",
    })

    const loginResponse = await new Promise<{
      authResponse?: { code?: string | null } | null
      status?: string
    }>((resolve) => {
      facebookSdk.login(resolve, {
        config_id: embeddedSignup.configId,
        response_type: embeddedSignup.responseType || "code",
        override_default_response_type:
          embeddedSignup.overrideDefaultResponseType ?? true,
        extras:
          embeddedSignup.extras || {
            setup: {
              feature: "whatsapp_embedded_signup",
              sessionInfoVersion: "3",
              featureType: "whatsapp_business_app_onboarding",
            },
          },
      })
    })

    const code = String(loginResponse.authResponse?.code || "").trim()
    if (!code) {
      throw new Error("Meta Embedded Signup did not return an authorization code.")
    }

    const finalizeResponse = await apiClient.request({
      url: "/api/clients/oauth/meta",
      method: "POST",
      data: {
        code,
        state: start.state,
      },
      timeout: 9000,
      validateStatus: () => true,
    })

    const operationId = getLifecycleOperationId(finalizeResponse.data)
    openCallbackLifecycle({
      state: start.state,
      operationId,
      mode: start.mode,
    })
    return true
  }

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
      const response = await apiFetch<MetaStartResponse>(
        `/api/clients/oauth/meta?${query.toString()}`,
        {
          credentials: "include",
        }
      )

      if (!response.success || !response.data?.url) {
        throw new Error(response.message || "Failed to start connection")
      }

      await onConnected?.()
      if (platformKey === "whatsapp") {
        if (!response.data.embeddedSignup) {
          throw new Error("Meta Embedded Signup is not configured for WhatsApp.")
        }

        await launchWhatsAppEmbeddedSignup(response.data)
        return
      }

      window.location.assign(response.data.url)
    } catch (err) {
      console.error(`${platformKey} connect error`, err)
      setConnecting(null)
    }
  }

  const startConnect = (platformKey: MetaOAuthPlatform) => {
    if (getMetaOAuthPrecheckDismissed(platformKey)) {
      void connectMeta(platformKey)
      return
    }

    setPrecheckPlatform(platformKey)
  }

  const continueFromPrecheck = (platformKey: MetaOAuthPlatform) => {
    void connectMeta(platformKey)
  }

  const connectWhatsApp = () => {
    startConnect("whatsapp")
  }

  const connectInstagram = () => {
    startConnect("instagram")
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
    <>
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
    <MetaOAuthPrecheckModal
      key={precheckPlatform || "meta-precheck-closed"}
      platform={precheckPlatform}
      loading={Boolean(connecting)}
      onClose={() => setPrecheckPlatform(null)}
      onContinue={() => {
        if (!precheckPlatform) {
          return
        }

        continueFromPrecheck(precheckPlatform)
      }}
    />
    </>
  )
}
