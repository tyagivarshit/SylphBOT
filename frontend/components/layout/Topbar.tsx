"use client";

import { Menu, Search } from "lucide-react";
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
  const [openSearch, setOpenSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const debounced = useDebounce(search, 300);

  /* ================= USER ================= */
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

  /* ================= NOTIFICATIONS ================= */
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

  const unreadCount = data?.unreadCount ?? 0;

  /* ================= SEARCH ================= */
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

  return (
    <div
      className="
        sticky top-0 z-30
        h-16

        bg-white/70 backdrop-blur-xl
        border-b border-blue-100

        flex items-center justify-between
        px-4 sm:px-6
      "
    >
      {/* 🔥 LEFT (BRANDING FIXED) */}
      <h1
        className="text-2xl sm:text-3xl font-extrabold tracking-wide bg-gradient-to-r from-[#0A1F44] via-[#1E90FF] to-[#00C6FF] bg-clip-text text-transparent whitespace-nowrap"
        style={{ fontFamily: "Orbitron" }}
      >
        Automexa
      </h1>

      {/* 🔥 RIGHT */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        
        {/* 🔍 SEARCH */}
        <div
          ref={containerRef}
          className="relative hidden md:block w-48 lg:w-64 xl:w-72 max-w-full"
        >
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpenSearch(true);
            }}
            placeholder="Search..."
            className="w-full border border-blue-100 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-900 bg-white/80 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          {openSearch && (
            <div className="absolute mt-2 w-full bg-white border border-blue-100 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto">
              
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
                  className={`p-3 text-sm cursor-pointer ${
                    index === activeIndex
                      ? "bg-blue-50"
                      : "hover:bg-blue-50"
                  }`}
                >
                  {item.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🔔 NOTIFICATIONS */}
        <div className="relative flex-shrink-0">
          <NotificationsDropdown userId={userData?.id} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </div>

        {/* 👤 PROFILE */}
        <div className="flex-shrink-0">
          <ProfileDropdown />
        </div>

        {/* 🍔 MENU BUTTON */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="lg:hidden p-2 rounded-xl hover:bg-blue-50 active:scale-95 transition duration-200"
        >
          <Menu size={20} className="text-gray-800" />
        </button>

      </div>
    </div>
  );
}

export default memo(TopbarComponent);