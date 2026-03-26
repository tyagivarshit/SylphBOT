"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function NotificationsDropdown({
  userId,
}: {
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  /* ---------------- FETCH INITIAL ---------------- */
  useEffect(() => {
    if (!userId) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/notifications", {
          credentials: "include",
        });

        const data = await res.json();

        console.log("NOTIFICATIONS API:", data);

        // ✅ FIXED
        const notificationsData = data?.notifications || [];
        const unreadCount = data?.unreadCount ?? 0;

        setNotifications(notificationsData);
        setUnread(unreadCount);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchNotifications();
  }, [userId]);

  /* ---------------- SOCKET ---------------- */
  useEffect(() => {
    if (!userId) return;

    socket.emit("join_user_room", userId);

    socket.on("new_notification", (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnread((prev) => prev + 1);
    });

    return () => {
      socket.off("new_notification");
    };
  }, [userId]);

  /* ---------------- MARK READ ---------------- */
  const markAllRead = async () => {
    try {
      await fetch("http://localhost:5000/api/notifications/read-all", {
        method: "PATCH",
        credentials: "include",
      });

      setUnread(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error("Mark read error:", err);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)} // ✅ FIX (no auto mark)
        className="relative p-2 rounded-lg hover:bg-gray-100"
      >
        <Bell size={18} className="text-gray-700" />

        {unread > 0 && (
          <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white px-1.5 rounded-full">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 max-h-96 overflow-y-auto z-50">
          
          {/* 🔥 MARK ALL READ BUTTON */}
          {notifications.length > 0 && (
            <div className="flex justify-end mb-2">
              <button
                onClick={markAllRead}
                className="text-xs text-[#14E1C1] font-medium hover:underline"
              >
                Mark all as read
              </button>
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500">No notifications</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-2 rounded-lg mb-2 ${
                  !n.read ? "bg-gray-100" : ""
                }`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-gray-500">{n.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}