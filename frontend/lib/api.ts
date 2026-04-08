import axios from "axios";
import { getApiBaseUrl } from "@/lib/url";

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});
