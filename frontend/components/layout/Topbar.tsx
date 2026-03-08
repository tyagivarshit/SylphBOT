"use client"

import { Bell, Search } from "lucide-react"

export default function Topbar() {

return(

<div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">

{/* Search */}

<div className="relative w-80">

<Search
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
placeholder="Search leads, clients..."
className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>


{/* Right Section */}

<div className="flex items-center gap-5">

{/* Notifications */}

<button className="relative p-2 rounded-lg hover:bg-gray-100 transition">

<Bell size={18} className="text-gray-600"/>

<span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>

</button>


{/* User */}

<div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 cursor-pointer transition">

<div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
U
</div>

<div className="flex flex-col leading-tight">

<span className="text-sm font-medium text-gray-800">
User
</span>

<span className="text-xs text-gray-500">
Free Plan
</span>

</div>

</div>

</div>

</div>

)

}