import { io } from "socket.io-client";
import { getAbsoluteApiOrigin } from "@/lib/url";

const URL = getAbsoluteApiOrigin();

export const socket = io(URL, {
  transports: ["websocket"],
  withCredentials: true, // 🔥 IMPORTANT (cookies auth ke liye)
  autoConnect: true,
});
