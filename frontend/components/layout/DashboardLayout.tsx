"use client"

import Sidebar from "./Sidebar"
import Topbar from "./Topbar"

export default function DashboardLayout({ children }: any) {

return(

<div className="flex h-screen bg-gray-100">

{/* Sidebar */}

<Sidebar />


{/* Main */}

<div className="flex flex-col flex-1 overflow-hidden">

{/* Topbar */}

<Topbar />


{/* Content */}

<main className="flex-1 overflow-y-auto">

<div className="max-w-7xl mx-auto px-6 py-6 w-full">

{children}

</div>

</main>

</div>

</div>

)

}