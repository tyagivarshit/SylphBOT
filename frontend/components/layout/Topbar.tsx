"use client";

import { Bell, Search, Menu } from "lucide-react";
import { Dispatch, SetStateAction, useState, memo } from "react";

interface TopbarProps {
  setOpen: Dispatch<SetStateAction<boolean>>;
}

function TopbarComponent({ setOpen }: TopbarProps) {
  const [search, setSearch] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    console.log("Search:", e.target.value);
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-40">

      {/* LEFT */}
      <div className="flex items-center gap-3 min-w-0">

        {/* MOBILE MENU */}
        <button
          onClick={() => setOpen(true)}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <Menu size={20} className="text-gray-700" />
        </button>

        {/* 🔥 BRAND (LOGIN STYLE) */}
        <h1 className="flex items-center text-lg sm:text-xl font-bold tracking-[0.25em] font-[Poppins]">
          <span className="text-[#14E1C1]">S</span>
          <span className="text-[#14E1C1]">Y</span>
          <span className="text-gray-900">LPH</span>
        </h1>

      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 sm:gap-4">

        {/* DESKTOP SEARCH */}
        <div className="relative hidden sm:block">

          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={handleSearch}
            placeholder="Search..."
            className="
              w-40 sm:w-56 lg:w-72
              border border-gray-200 rounded-lg
              pl-9 pr-3 py-2
              text-sm text-gray-900
              placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-[#14E1C1] focus:border-transparent
              transition
            "
          />
        </div>

        {/* MOBILE SEARCH BUTTON */}
        <button
          onClick={() => setShowMobileSearch((prev) => !prev)}
          className="sm:hidden p-2 rounded-lg hover:bg-gray-100"
        >
          <Search size={18} className="text-gray-700" />
        </button>

        {/* MOBILE SEARCH INPUT */}
        {showMobileSearch && (
          <input
            autoFocus
            value={search}
            onChange={handleSearch}
            placeholder="Search..."
            className="
              fixed top-16 left-0 w-full z-50
              border-b border-gray-200
              bg-white
              px-4 py-3 text-sm text-gray-900
              placeholder-gray-500
              focus:outline-none
            "
          />
        )}

        {/* NOTIFICATIONS */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition">
          <Bell size={18} className="text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* PROFILE */}
        <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-gray-100 cursor-pointer transition">

          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-xs font-semibold text-white">
            U
          </div>

          <span className="hidden sm:block text-sm font-medium text-gray-900">
            User
          </span>

        </div>

      </div>

    </div>
  );
}

export default memo(TopbarComponent);