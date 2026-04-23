import axios, { AxiosHeaders, type RawAxiosRequestHeaders } from "axios";
import { getApiBaseUrl } from "@/lib/url";

const getStoredAuthToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return (
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token")
    );
  } catch {
    return null;
  }
};

const setAuthorizationHeader = (
  headers: unknown,
  token: string
) => {
  const nextHeaders =
    headers instanceof AxiosHeaders ? headers : new AxiosHeaders();

  if (headers && !(headers instanceof AxiosHeaders)) {
    Object.entries(headers as RawAxiosRequestHeaders).forEach(([key, value]) => {
      nextHeaders.set(key, value);
    });
  }

  nextHeaders.set("Authorization", `Bearer ${token}`);

  return nextHeaders;
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getStoredAuthToken();

  if (token) {
    config.headers = setAuthorizationHeader(config.headers, token);
  }

  return config;
});
