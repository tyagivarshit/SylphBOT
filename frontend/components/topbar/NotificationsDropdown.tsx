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
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-blue-50 transition"
      >
        <Bell size={18} className="text-gray-700" />

        {unread > 0 && (
          <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-lg p-4 max-h-96 overflow-y-auto z-50">

          {/* HEADER ACTION */}
          {notifications.length > 0 && (
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-900">
                Notifications
              </p>
              <button
                onClick={markAllRead}
                className="text-xs font-semibold bg-blue-50 text-gray-700 px-2.5 py-1 rounded-lg hover:shadow-sm transition"
              >
                Mark all
              </button>
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No notifications
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl mb-2 border border-blue-100 transition ${
                  !n.read
                    ? "bg-blue-50"
                    : "bg-white/60 backdrop-blur"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {n.message}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}