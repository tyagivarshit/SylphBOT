"use client"

import { useState } from "react"
import Sidebar from "./Sidebar"
import Topbar from "./Topbar"

export default function DashboardLayout({ children }: any) {

const [open,setOpen] = useState(false)

return(

<div className="flex h-screen bg-gray-100 overflow-hidden">

{/* Sidebar */}

<Sidebar open={open} setOpen={setOpen} />

{/* Main */}

<div className="flex flex-col flex-1 overflow-hidden">

{/* Topbar */}

<Topbar setOpen={setOpen} />

{/* Content */}

<main className="flex-1 overflow-y-auto">

<div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">

{children}

</div>

</main>

</div>

</div>

)

}