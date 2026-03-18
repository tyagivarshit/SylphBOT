"use client"

import { Bell, Search, Menu } from "lucide-react"
import { Dispatch, SetStateAction } from "react"

interface TopbarProps {
  setOpen: Dispatch<SetStateAction<boolean>>
}

export default function Topbar({ setOpen }: TopbarProps) {

return(

<div className="h-16 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-3 sm:px-6">

{/* 🔥 LEFT */}
<div className="flex items-center gap-3 min-w-0">

  {/* Mobile Sidebar */}
  <button
    onClick={()=>setOpen(true)}
    className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition"
  >
    <Menu size={20}/>
  </button>

  {/* BRAND */}
  <h1 className="text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap">
    <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 bg-clip-text text-transparent">
      SYLPH
    </span>
  </h1>

</div>

{/* 🔥 RIGHT */}
<div className="flex items-center gap-2 sm:gap-4">

  {/* 🔥 SEARCH (RESPONSIVE FIX) */}
  <div className="relative hidden sm:block">

    <Search
      size={16}
      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
    />

    <input
      placeholder="Search..."
      className="
        w-40 sm:w-56 lg:w-72
        border border-gray-200 rounded-lg
        pl-9 pr-3 py-2
        text-sm text-gray-700
        placeholder-gray-400
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
      "
    />

  </div>

  {/* 🔥 MOBILE SEARCH ICON */}
  <button className="sm:hidden p-2 rounded-lg hover:bg-gray-100">
    <Search size={18}/>
  </button>

  {/* Notifications */}
  <button className="relative p-2 rounded-lg hover:bg-gray-100 transition">

    <Bell size={18} className="text-gray-600"/>

    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>

  </button>

  {/* Profile */}
  <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-gray-100 cursor-pointer transition">

    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-xs font-semibold text-white">
      U
    </div>

    <span className="hidden sm:block text-sm font-medium text-gray-800">
      User
    </span>

  </div>

</div>

</div>

)

}