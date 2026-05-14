"use client";

import { memo } from "react";

/* ======================================
🔥 TYPES (STRICT)
====================================== */

type ActivityItem = {
  id: string;
  text: string;
  time: string | number | Date;
};

type Props = {
  activity?: ActivityItem[];
};

/* ======================================
🔥 UTILS
====================================== */

function formatTime(time: ActivityItem["time"]) {
  try {
    const date = new Date(time);

    if (isNaN(date.getTime())) return "—";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/* ======================================
🔥 COMPONENT
====================================== */

function RecentActivityComponent({ activity = [] }: Props) {

  // 🔥 LIMIT (prevent UI lag)
  const safeActivity = activity.slice(0, 20);

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">

      <h2 className="text-sm font-semibold text-gray-900 mb-5">
        Recent Activity
      </h2>

      {safeActivity.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-blue-200 rounded-xl bg-white/70">
          No activity yet
        </div>
      ) : (
        <div className="space-y-4">

          {safeActivity.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between text-sm text-gray-700"
            >

              {/* LEFT */}
              <div className="flex items-start gap-3">

                <span className="w-2 h-2 mt-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 shrink-0" />

                <span className="leading-snug break-words text-gray-800">
                  {item.text || "—"}
                </span>

              </div>

              {/* TIME */}
              <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                {formatTime(item.time)}
              </span>

            </div>
          ))}

        </div>
      )}

    </div>
  );
}

/* ======================================
🔥 MEMO (PERFORMANCE)
====================================== */

export default memo(RecentActivityComponent);