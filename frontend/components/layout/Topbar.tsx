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
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
        h-16 shrink-0
        bg-white/80 backdrop-blur-xl
        border-b border-blue-100
        flex items-center justify-between
        px-3 sm:px-6
        relative z-50
      "
    >
      {/* LEFT */}
      <h1
        className="text-xl sm:text-3xl font-extrabold tracking-wide bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent whitespace-nowrap"
        style={{ fontFamily: "Orbitron" }}
      >
        Automexa
      </h1>

      {/* RIGHT */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">

        {/* SEARCH */}
        <div
          ref={containerRef}
          className="relative hidden md:block w-48 lg:w-64 xl:w-72"
        >
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
            placeholder="Search..."
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            name="global-search"
            className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-900 bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
          />

          {openSearch && search.trim().length > 0 && (
            <div className="absolute mt-2 w-full bg-white border border-blue-100 rounded-2xl shadow-lg z-[9999] max-h-72 overflow-y-auto">
              {search.trim().length < 2 && (
                <div className="p-3 text-sm text-gray-500">
                  Type at least 2 characters
                </div>
              )}
              {search.trim().length >= 2 && isLoading && (
                <div className="p-3 text-sm text-gray-500">Searching...</div>
              )}
              {search.trim().length >= 2 && !isLoading && results.length === 0 && (
                <div className="p-3 text-sm text-gray-500">No results</div>
              )}
              {search.trim().length >= 2 && results.map((item: any, index: number) => (
                <div
                  key={item.id}
                  onClick={() => {
                    router.push(item.searchUrl || item.url);
                    setOpenSearch(false);
                    setSearch("");
                  }}
                  className={`px-4 py-3 text-sm cursor-pointer transition ${
                    index === activeIndex
                      ? "bg-blue-50"
                      : "hover:bg-blue-50"
                  }`}
                >
                  <div className="font-medium text-gray-900">
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div className="mt-1 text-xs text-gray-500 truncate">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NOTIFICATIONS */}
        <div className="relative flex-shrink-0 z-[100]">
          <NotificationsDropdown userId={userData?.id} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </div>

        {/* PROFILE */}
        <div className="relative flex-shrink-0 z-[1000]">
          <ProfileDropdown />
        </div>

        {/* MENU BUTTON */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="lg:hidden p-2 rounded-xl hover:bg-blue-50 active:scale-95 transition"
        >
          <Menu size={20} className="text-gray-800" />
        </button>

      </div>
    </div>
  );
}

export default memo(TopbarComponent);
