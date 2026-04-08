"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useEffect, useRef } from "react";

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

type SidebarProps = {
  open: boolean;
  setOpen: (val: boolean) => void;
};

const menu = [
  {
    section: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
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
    items: [{ name: "Settings", href: "/settings", icon: Settings }],
  },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

function SidebarComponent({ open, setOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("sidebar_scroll");
    if (saved && scrollRef.current) {
      scrollRef.current.scrollTop = Number(saved);
    }
  }, []);

  const handleScroll = () => {
    if (scrollRef.current) {
      sessionStorage.setItem(
        "sidebar_scroll",
        String(scrollRef.current.scrollTop)
      );
    }
  };

  return (
    <>
      {/* 🔥 OVERLAY (mobile only) */}
      <div
        onClick={() => setOpen(false)}
        className={`
          fixed inset-0 bg-black/40 backdrop-blur-sm z-40
          transition-opacity duration-300
          lg:hidden
          ${open ? "opacity-100 visible" : "opacity-0 invisible"}
        `}
      />

      {/* 🔥 SIDEBAR */}
      <aside
        className={`
          fixed lg:relative
          top-0 left-0
          h-screen lg:h-full
          w-64 max-w-[85%]

          bg-white/80 backdrop-blur-xl
          border-r border-blue-100

          flex flex-col
          z-50

          transform transition-transform duration-300 ease-out

          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* 🔥 MOBILE HEADER */}
        <div className="lg:hidden h-16 flex items-center justify-between px-4 border-b border-blue-100">
          <span className="font-semibold text-sm text-gray-700">Menu</span>
          <button onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* 🔥 NAV */}
        <nav
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 space-y-6"
        >
          {menu.map((group) => (
            <div key={group.section}>
              <p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
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
                      onMouseEnter={() => router.prefetch(item.href)}
                      onClick={() => setOpen(false)}
                      className={`
                        flex items-center gap-3
                        px-3 py-2.5 rounded-xl text-[13px] font-medium
                        transition-all duration-200 hover:shadow-sm

                        ${
                          active
                            ? "bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700"
                            : "text-gray-600 hover:bg-blue-50"
                        }
                      `}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 🔥 FOOTER */}
        <div className="h-[60px] flex items-center justify-center border-t border-blue-100">
          <p className="text-[12px] text-gray-500 font-medium">
            Automexia AI
          </p>
        </div>
      </aside>
    </>
  );
}

export default memo(SidebarComponent);
