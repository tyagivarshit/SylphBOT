"use client"

import { useState, ReactNode } from "react"
import Sidebar from "./Sidebar"
import Topbar from "./Topbar"

export default function DashboardLayout({
children,
}: {
children: ReactNode
}) {

const [open,setOpen] = useState(false)

return(

<div className="h-screen flex flex-col bg-gray-50">

  {/* 🔥 TOPBAR (FULL WIDTH) */}
  <Topbar setOpen={setOpen} />

  {/* 🔥 MAIN BODY */}
  <div className="flex flex-1 overflow-hidden">

    {/* 🔥 SIDEBAR (NOW BELOW TOPBAR) */}
    <Sidebar open={open} setOpen={setOpen} />

    {/* 🔥 MAIN CONTENT */}
    <div className="flex flex-col flex-1 min-w-0">

      <main className="flex-1 overflow-y-auto">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {children}
        </div>

      </main>

    </div>

  </div>

</div>

)
}