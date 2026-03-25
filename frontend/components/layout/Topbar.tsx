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
import { useRouter } from "next/navigation"; // ✅ ADDED

interface TopbarProps {
  setOpen: Dispatch<SetStateAction<boolean>>;
}

function TopbarComponent({ setOpen }: TopbarProps) {
  const [search, setSearch] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter(); // ✅ ADDED

  const debounced = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      if (!debounced) return [];
      const res = await fetch(`/api/search?q=${debounced}`);
      return res.json();
    },
    enabled: !!debounced,
  });

  const results = Array.isArray(data) ? data : [];

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
      router.push(results[activeIndex]?.url); // ✅ FIXED
    }
  };

  const user = {
    name: "User",
    email: "user@example.com",
    plan: "PRO",
    business: { name: "My Business" },
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

        {/* DESKTOP SEARCH */}
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
            className="
              w-full border border-gray-200 rounded-lg
              pl-9 pr-3 py-2 text-sm
              text-gray-900 placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-[#14E1C1]
            "
          />

          {openSearch && (
            <div className="absolute mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">

              {isLoading && (
                <div className="p-3 text-sm text-gray-500">
                  Searching...
                </div>
              )}

              {!isLoading && results.length === 0 && (
                <div className="p-3 text-sm text-gray-500">
                  No results found
                </div>
              )}

              {results.map((item: any, index: number) => (
                <div
                  key={item.id}
                  onClick={() => router.push(item.url)} // ✅ FIXED
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

        {/* MOBILE SEARCH */}
        <button
          onClick={() => setShowMobileSearch(true)}
          className="sm:hidden p-2 rounded-lg hover:bg-gray-100"
        >
          <Search size={18} className="text-gray-700" />
        </button>

        {showMobileSearch && (
          <div className="fixed inset-0 bg-white z-50 flex flex-col p-4">

            <div className="flex items-center gap-2 mb-4">
              <Search size={18} className="text-gray-500" />

              <input
                autoFocus
                value={search}
                onChange={handleSearch}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="flex-1 text-sm text-gray-900 outline-none"
              />

              <button onClick={() => setShowMobileSearch(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="text-sm text-gray-500">
                  Searching...
                </div>
              )}

              {!isLoading && results.length === 0 && (
                <div className="text-sm text-gray-500">
                  No results
                </div>
              )}

              {results.map((item: any, index: number) => (
                <div
                  key={item.id}
                  onClick={() => router.push(item.url)} // ✅ FIXED
                  className={`p-3 text-sm text-gray-800 rounded ${
                    index === activeIndex ? "bg-gray-100" : ""
                  }`}
                >
                  {item.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        <NotificationsDropdown />

        {/* PROFILE */}
        <ProfileDropdown user={user} />

      </div>
    </div>
  );
}

export default memo(TopbarComponent);