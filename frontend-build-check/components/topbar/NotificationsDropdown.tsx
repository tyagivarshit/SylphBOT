"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import {
  fetchNotifications,
  markAllNotificationsRead,
} from "@/lib/userApi";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read?: boolean;
};

export default function NotificationsDropdown({
  userId,
}: {
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  /* ---------------- FETCH INITIAL ---------------- */
  useEffect(() => {
    if (!userId) return;

    const loadNotifications = async () => {
      try {
        const data = await fetchNotifications();

        console.log("NOTIFICATIONS API:", data);

        const notificationsData = (data?.notifications || []) as NotificationItem[];
        const unreadCount = data?.unreadCount ?? 0;

        setNotifications(notificationsData);
        setUnread(unreadCount);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    loadNotifications();
  }, [userId]);

  /* ---------------- SOCKET ---------------- */
  useEffect(() => {
    if (!userId) return;

    socket.on("new_notification", (notification: NotificationItem) => {
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
      await markAllNotificationsRead();

      setUnread(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error("Mark read error:", err);
    }
  };

  const badgeLabel = unread > 99 ? "99+" : String(unread);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-blue-50 transition sm:h-11 sm:w-11"
      >
        <Bell size={17} className="text-gray-700" />

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm sm:-right-1 sm:-top-1 sm:h-[1.35rem] sm:min-w-[1.35rem] sm:text-[11px]">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 max-h-96 w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-lg backdrop-blur-xl sm:w-80">

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
                <p className="break-words text-sm font-semibold text-gray-900">
                  {n.title}
                </p>
                <p className="mt-1 break-words text-xs text-gray-500">
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
