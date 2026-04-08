"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo } from "react";

import {
  Workflow,
  Brain,
  Instagram,
  MessageCircle,
  Calendar,
  type LucideIcon,
} from "lucide-react";

type QuickAction = {
  title: string;
  desc: string;
  href: Route;
  icon: LucideIcon;
};

const actions: QuickAction[] = [
  {
    title: "Create Automation",
    desc: "Build a new AI automation flow",
    href: "/automation",
    icon: Workflow,
  },
  {
    title: "Train AI",
    desc: "Add knowledge for AI replies",
    href: "/ai-training",
    icon: Brain,
  },
  {
    title: "Connect Instagram",
    desc: "Start capturing Instagram leads",
    href: "/settings",
    icon: Instagram,
  },
  {
    title: "Connect WhatsApp",
    desc: "Enable WhatsApp automation",
    href: "/settings",
    icon: MessageCircle,
  },
  {
    title: "Add Booking Slot",
    desc: "Setup calendar availability",
    href: "/booking",
    icon: Calendar,
  },
];

function QuickActionsComponent() {
  const router = useRouter();

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">

      <h3 className="text-sm font-semibold text-gray-900 mb-5">
        Quick Actions
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.title}
              href={action.href}
              prefetch
              aria-label={action.title}
              className="group flex items-start gap-3 border border-blue-100 rounded-2xl p-4 bg-white/70 backdrop-blur transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              onMouseEnter={() => {
                router.prefetch(action.href);
              }}
              onClick={() => {
                console.log("QuickAction Click:", action.title);
              }}
            >
              {/* ICON */}
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition">
                <Icon size={18} />
              </div>

              {/* TEXT */}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {action.title}
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  {action.desc}
                </p>
              </div>
            </Link>
          );
        })}

      </div>

    </div>
  );
}

/* ======================================
🔥 MEMO (PERFORMANCE BOOST)
====================================== */

export default memo(QuickActionsComponent);
