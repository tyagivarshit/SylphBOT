"use client";

import type { Route } from "next";
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
  type LucideIcon,
} from "lucide-react";

type SidebarProps = {
  open: boolean;
  setOpen: (val: boolean) => void;
};

type MenuItem = {
  name: string;
  href: Route;
  icon: LucideIcon;
};

type MenuSection = {
  section: string;
  items: MenuItem[];
};

const menu: MenuSection[] = [
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

const brandLogoSrc = "/logo%20.png";

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
          fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm
          transition-opacity duration-300
          lg:hidden
          ${open ? "visible opacity-100" : "invisible opacity-0"}
        `}
      />

      {/* 🔥 SIDEBAR */}
      <aside
        className={`
          brand-sidebar-panel fixed left-0 top-0 z-50 flex h-screen w-[82vw] max-w-[310px]
          flex-col overflow-hidden rounded-none px-4 py-4 transition-transform duration-300 ease-out

          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:top-0 lg:h-full lg:min-h-0 lg:w-[290px] lg:max-w-none
          lg:translate-x-0 lg:self-stretch lg:rounded-[32px]
        `}
      >
        {/* 🔥 MOBILE HEADER */}
        <div className="mb-5 flex items-center justify-between gap-3 lg:mb-7">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/16 bg-white/90 shadow-[0_16px_30px_rgba(8,18,35,0.24)]">
              <img
                src={brandLogoSrc}
                alt="Automexia AI"
                className="h-full w-full object-cover"
              />
            </span>

            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.3em] text-white/58 sm:text-[11px]">
                  Automexia
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/86 sm:text-[11px]">
                  Lead OS
                </span>
              </span>

              <span className="mt-1 block truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                Automexia AI
              </span>
            </span>
          </Link>

          <button
            onClick={() => setOpen(false)}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white/80 transition hover:bg-white/12 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* 🔥 NAV */}
        <nav
          ref={scrollRef}
          onScroll={handleScroll}
          className="brand-scrollbar flex-1 space-y-7 overflow-y-auto overflow-x-hidden pr-1"
        >
          {menu.map((group) => (
            <div key={group.section}>
              <p className="mb-3 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/38">
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
                        flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13px] font-medium transition-all duration-200

                        ${
                          active
                            ? "bg-white text-slate-950 shadow-[0_16px_34px_rgba(8,18,35,0.22)]"
                            : "text-white/72 hover:bg-white/10 hover:text-white"
                        }
                      `}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-2xl ${
                          active
                            ? "bg-slate-100 text-blue-600"
                            : "bg-white/8 text-sky-100"
                        }`}
                      >
                        <Icon size={18} className="flex-shrink-0" />
                      </span>
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 🔥 FOOTER */}
        <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <div className="rounded-[26px] border border-white/10 bg-white/8 p-4">
            <span className="brand-chip brand-chip-dark w-fit">
              Always-on AI sales desk
            </span>
            <p className="mt-3 text-sm leading-6 text-white/64">
              Product-first command center for conversations, CRM, automation,
              and lead conversion.
            </p>
          </div>

          <p className="px-1 text-xs text-white/42">© 2026 Automexia AI</p>
        </div>
      </aside>
    </>
  );
}

export default memo(SidebarComponent);
