"use client";

import { Menu, Search, ShieldCheck } from "lucide-react";
import {
  Dispatch,
  SetStateAction,
  useState,
  memo,
  useRef,
  useEffect,
} from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import NotificationsDropdown from "../topbar/NotificationsDropdown";
import ProfileDropdown from "../topbar/ProfileDropdown";
import { usePathname, useRouter } from "next/navigation";
import BrandLockup from "@/components/brand/BrandLockup";
import {
  fetchCurrentUser,
  fetchNotifications,
  searchApp,
} from "@/lib/userApi";

interface TopbarProps {
  setOpen: Dispatch<SetStateAction<boolean>>;
}

function TopbarComponent({ setOpen }: TopbarProps) {
  const [search, setSearch] = useState("");
  const [openSearch, setOpenSearch] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const debounced = useDebounce(search, 300);
  const normalizedQuery = debounced.trim();
  const shouldSearch = openSearch && normalizedQuery.length > 0;

  const { data: userData } = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
  });

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
  });

  const unreadCount = data?.unreadCount ?? 0;

  const { data: searchData, isLoading } = useQuery({
    queryKey: ["search", normalizedQuery],
    queryFn: () => searchApp(normalizedQuery),
    enabled: shouldSearch,
  });

  const results = Array.isArray(searchData) ? searchData : [];
  const currentPage = getPageMeta(pathname);

  useEffect(() => {
    function handleClickOutside(e: any) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenSearch(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="brand-topbar sticky top-0 z-40 rounded-[28px] px-3 py-3 sm:px-4 lg:px-5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 transition hover:text-slate-950 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <BrandLockup
            href="/dashboard"
            compact
            showTagline={false}
            className="min-w-0 lg:hidden"
          />

          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="flex items-center gap-3">
              <span className="brand-eyebrow">{currentPage.eyebrow}</span>
              <span className="brand-chip brand-chip-success hidden xl:inline-flex">
                <ShieldCheck size={13} />
                Always-on AI sales desk
              </span>
            </div>

            <div className="mt-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                {currentPage.title}
              </h1>
              <p className="truncate text-sm text-slate-500">
                {currentPage.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative hidden md:block w-52 lg:w-72 xl:w-80"
        >
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpenSearch(Boolean(e.target.value.trim()));
            }}
            onFocus={() => {
              if (search.trim()) setOpenSearch(true);
            }}
            placeholder="Search workspace"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            name="global-search"
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white/78 px-4 py-2.5 pl-10 text-sm text-slate-900 outline-none"
          />

          {openSearch && search.trim().length > 0 ? (
            <div className="brand-panel-strong brand-scrollbar absolute right-0 z-[9999] mt-3 max-h-80 w-full overflow-y-auto rounded-[26px] p-2">
              {search.trim().length < 2 ? (
                <div className="rounded-2xl px-4 py-3 text-sm text-slate-500">
                  Type at least 2 characters
                </div>
              ) : null}
              {search.trim().length >= 2 && isLoading ? (
                <div className="rounded-2xl px-4 py-3 text-sm text-slate-500">
                  Searching...
                </div>
              ) : null}
              {search.trim().length >= 2 && !isLoading && results.length === 0 ? (
                <div className="rounded-2xl px-4 py-3 text-sm text-slate-500">
                  No results
                </div>
              ) : null}
              {search.trim().length >= 2
                ? results.map((item: any, index: number) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        router.push(item.searchUrl || item.url);
                        setOpenSearch(false);
                        setSearch("");
                      }}
                      className={`cursor-pointer rounded-2xl px-4 py-3 text-sm transition ${
                        index === 0
                          ? "bg-blue-50/90"
                          : "hover:bg-blue-50/70"
                      }`}
                    >
                      <div className="font-medium text-slate-900">
                        {item.title}
                      </div>
                      {item.subtitle ? (
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {item.subtitle}
                        </div>
                      ) : null}
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>

        <div className="relative z-[100] flex-shrink-0">
          <NotificationsDropdown userId={userData?.id} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
          ) : null}
        </div>

        <div className="relative z-[1000] flex-shrink-0">
          <ProfileDropdown />
        </div>
      </div>
    </div>
  );
}

function getPageMeta(pathname: string) {
  const routes = [
    {
      match: "/dashboard",
      title: "Revenue command center",
      eyebrow: "Overview",
      subtitle: "Live visibility into leads, usage, and active conversations.",
    },
    {
      match: "/leads",
      title: "Leads CRM",
      eyebrow: "CRM",
      subtitle: "Track stages, live activity, and conversion-ready conversations.",
    },
    {
      match: "/conversations",
      title: "Conversation desk",
      eyebrow: "Inbox",
      subtitle: "Manage live messages with a premium client-facing workflow.",
    },
    {
      match: "/automation",
      title: "Automation engine",
      eyebrow: "Automation",
      subtitle: "Build flows that feel enterprise-grade, not generic.",
    },
    {
      match: "/comment-automation",
      title: "Comment automation",
      eyebrow: "Automation",
      subtitle: "Turn public engagement into private lead conversion.",
    },
    {
      match: "/ai-training",
      title: "AI training",
      eyebrow: "Intelligence",
      subtitle: "Shape tone, knowledge, and conversion behavior for your AI desk.",
    },
    {
      match: "/knowledge-base",
      title: "Knowledge base",
      eyebrow: "Intelligence",
      subtitle: "Organize business context so replies stay accurate and on-brand.",
    },
    {
      match: "/booking",
      title: "Booking operations",
      eyebrow: "Business",
      subtitle: "Availability, sessions, and scheduling with a trusted premium feel.",
    },
    {
      match: "/analytics",
      title: "Analytics",
      eyebrow: "Insights",
      subtitle: "Measure funnel health, sources, and conversion momentum.",
    },
    {
      match: "/billing",
      title: "Billing and access",
      eyebrow: "Growth",
      subtitle: "Plans, payments, and activation controls for the workspace.",
    },
    {
      match: "/settings",
      title: "Workspace settings",
      eyebrow: "System",
      subtitle:
        "Manage business details, integrations, notifications, and account security.",
    },
  ];

  return (
    routes.find((item) =>
      item.match === "/dashboard"
        ? pathname === item.match
        : pathname.startsWith(item.match)
    ) || {
      title: "Automexia AI workspace",
      eyebrow: "Lead OS",
      subtitle: "Premium automation and conversion operations for your team.",
    }
  );
}

export default memo(TopbarComponent);
