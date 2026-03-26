"use client";

import { Bell, Search, Menu, X } from "lucide-react";
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
import { useRouter } from "next/navigation";

interface TopbarProps {
  setOpen: Dispatch<SetStateAction<boolean>>;
}

function TopbarComponent({ setOpen }: TopbarProps) {
  const [search, setSearch] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const debounced = useDebounce(search, 300);

  /* =========================
     🔥 USER
  ========================= */
  const { data: userData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("http://localhost:5000/api/user/me", {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const user = {
    name: userData?.name || "User",
    email: userData?.email || "user@example.com",
    avatar: userData?.avatar || null,
    plan: "PRO",
    business: { name: userData?.business?.name || "My Business" },
  };

  /* =========================
     🔥 NOTIFICATIONS (FIXED)
  ========================= */
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("http://localhost:5000/api/notifications", {
        credentials: "include",
      });

      if (!res.ok) {
        return { notifications: [], unreadCount: 0 };
      }

      return res.json();
    },
  });

  // ✅ FIX HERE
  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount ?? 0;

  /* =========================
     🔥 SEARCH
  ========================= */
  const { data: searchData, isLoading } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      if (!debounced) return [];
      const res = await fetch(`/api/search?q=${debounced}`);
      return res.json();
    },
    enabled: !!debounced,
  });

  const results = Array.isArray(searchData) ? searchData : [];

  useEffect(() => {
    function handleClickOutside(e: any) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenSearch(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setOpenSearch(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;

    if (e.key === "ArrowDown") {
      setActiveIndex((prev) => (prev + 1) % results.length);
    }

    if (e.key === "ArrowUp") {
      setActiveIndex((prev) =>
        prev === 0 ? results.length - 1 : prev - 1
      );
    }

    if (e.key === "Enter") {
      router.push(results[activeIndex]?.url);
    }
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">

      {/* LEFT */}
      <div className="flex items-center gap-3 min-w-0">

        <button
          onClick={() => setOpen(true)}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <Menu size={20} className="text-gray-700" />
        </button>

        <h1 className="flex items-center text-lg sm:text-xl font-bold tracking-[0.25em] font-[Poppins]">
          <span className="text-[#14E1C1]">S</span>
          <span className="text-[#14E1C1]">Y</span>
          <span className="text-gray-900">LPH</span>
        </h1>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 sm:gap-4">

        {/* SEARCH */}
        <div
          ref={containerRef}
          className="relative hidden sm:block w-44 sm:w-56 lg:w-72"
        >
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={handleSearch}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpenSearch(true)}
            placeholder="Search..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#14E1C1]"
          />

          {openSearch && (
            <div className="absolute mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">

              {isLoading && (
                <div className="p-3 text-sm text-gray-500">Searching...</div>
              )}

              {!isLoading && results.length === 0 && (
                <div className="p-3 text-sm text-gray-500">No results</div>
              )}

              {results.map((item: any, index: number) => (
                <div
                  key={item.id}
                  onClick={() => router.push(item.url)}
                  className={`p-3 text-sm text-gray-800 cursor-pointer ${
                    index === activeIndex
                      ? "bg-gray-100"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {item.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🔔 NOTIFICATIONS */}
        <div className="relative">
          <NotificationsDropdown userId={userData?.id} />

          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </div>

        {/* 👤 PROFILE */}
        <ProfileDropdown />

      </div>
    </div>
  );
}

export default memo(TopbarComponent);