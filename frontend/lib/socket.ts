import { io } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const socket = io(URL, {
  transports: ["websocket"],
  withCredentials: true, // 🔥 IMPORTANT (cookies auth ke liye)
  autoConnect: true,
});