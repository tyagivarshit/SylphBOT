import { apiFetch } from "@/lib/apiClient";

type ClientRecord = {
  id: string;
  platform: string;
  [key: string]: unknown;
};

const normalizeClients = (payload: unknown): ClientRecord[] => {
  if (Array.isArray(payload)) {
    return payload as ClientRecord[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { clients?: unknown[] }).clients)
  ) {
    return (payload as { clients: ClientRecord[] }).clients;
  }

  return [];
};

export async function getClients() {
  const response = await apiFetch<ClientRecord[] | { clients?: ClientRecord[] }>(
    "/api/clients"
  );

  if (!response.success) {
    throw new Error(response.message || "Failed to fetch clients");
  }

  return normalizeClients(response.data);
}

export async function createClient(data: unknown) {
  const response = await apiFetch<ClientRecord | { client?: ClientRecord }>(
    "/api/clients",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );

  if (!response.success) {
    throw new Error(response.message || "Failed to create client");
  }

  return response.data;
}
