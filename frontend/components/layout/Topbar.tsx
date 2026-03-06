"use client"

import { Bell, Search } from "lucide-react"

export default function Topbar() {
  return (
    <div className="h-16 border-b flex items-center justify-between px-6 bg-white">

      <div className="flex items-center gap-3 bg-gray-100 px-3 py-2 rounded-lg">
        <Search size={16} />
        <input
          placeholder="Search..."
          className="bg-transparent outline-none text-sm"
        />
      </div>

      <div className="flex items-center gap-5">
        <Bell size={20} />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-300" />
          <span className="text-sm font-medium">User</span>
        </div>
      </div>
    </div>
  )
}