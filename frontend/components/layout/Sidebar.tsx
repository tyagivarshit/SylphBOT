"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo } from "react";

import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Workflow,
  Brain,
  BookOpen,
  Calendar,
  BarChart3,
  CreditCard,
  Settings,
  MessageCircle,
  X,
} from "lucide-react";

/* ======================================
🔥 TYPES
====================================== */

type SidebarProps = {
  open: boolean;
  setOpen: (val: boolean) => void;
};

/* ======================================
🔥 MENU CONFIG
====================================== */

const menu = [
  {
    section: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "CRM",
    items: [
      { name: "Leads", href: "/leads", icon: Users },
      { name: "Conversations", href: "/conversations", icon: MessageCircle },
    ],
  },
  {
    section: "Automation",
    items: [
      { name: "Automation", href: "/automation", icon: Workflow },
      { name: "Comment Automation", href: "/comment-automation", icon: MessageSquare },
    ],
  },
  {
    section: "AI",
    items: [
      { name: "AI Training", href: "/ai-training", icon: Brain },
      { name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
    ],
  },
  {
    section: "Business",
    items: [
      { name: "Booking", href: "/booking", icon: Calendar },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Billing", href: "/billing", icon: CreditCard },
    ],
  },
  {
    section: "System",
    items: [
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/* ======================================
🔥 ACTIVE MATCH (FIXED)
====================================== */

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

/* ======================================
🔥 COMPONENT
====================================== */

function SidebarComponent({ open, setOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* ===== OVERLAY ===== */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity lg:hidden
        ${open ? "opacity-100 visible" : "opacity-0 invisible"}`}
      />

      {/* ===== SIDEBAR ===== */}
      <aside
        className={`
        fixed lg:relative z-50
        top-[64px] lg:top-0
        left-0
        h-[calc(100vh-64px)] lg:h-full
        w-64 sm:w-72 lg:w-64
        bg-white border-r border-gray-200
        flex flex-col
        transform transition-transform duration-300 ease-in-out

        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}
      >
        {/* ===== MOBILE HEADER ===== */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 lg:hidden">
          <span className="font-semibold text-gray-800">Menu</span>

          <button
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {/* ===== NAV ===== */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 sm:py-6 space-y-6">

          {menu.map((group) => (
            <div key={group.section}>

              <p className="px-3 mb-2 text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {group.section}
              </p>

              <div className="space-y-1">

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActiveRoute(pathname, item.href);

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => router.prefetch(item.href)}
                      onClick={() => setOpen(false)}
                      aria-label={item.name}
                      className={`
                      flex items-center gap-3
                      px-3 sm:px-4 py-2.5
                      rounded-lg text-sm font-medium transition

                      ${active
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }
                    `}
                    >
                      <Icon size={18} />

                      <span className="truncate">
                        {item.name}
                      </span>
                    </Link>
                  );
                })}

              </div>

            </div>
          ))}

        </nav>

        {/* ===== FOOTER ===== */}
        <div className="p-4 border-t border-gray-100">
          <p className="text-xs sm:text-sm text-gray-800 text-center font-medium">
            Sylph v1.0
          </p>
        </div>

      </aside>
    </>
  );
}

/* ======================================
🔥 MEMO (PERFORMANCE)
====================================== */

export default memo(SidebarComponent);