"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
LayoutDashboard,
Users,
MessageSquare,
CreditCard,
Settings,
Brain,
X
} from "lucide-react"

const menu = [
{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
{ name: "Leads", href: "/leads", icon: MessageSquare },
{ name: "Clients", href: "/clients", icon: Users },
{ name: "Billing", href: "/billing", icon: CreditCard },
{ name: "AI Settings", href: "/ai-settings", icon: Brain },
{ name: "Settings", href: "/settings", icon: Settings },
]

export default function Sidebar({
open,
setOpen
}:any){

const pathname = usePathname()

return(

<>

{/* Overlay (mobile) */}

{open && (

<div
onClick={()=>setOpen?.(false)}
className="fixed inset-0 bg-black/30 z-40 lg:hidden"
/>

)}

<aside
className={`fixed lg:static z-50 top-0 left-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300

${open ? "translate-x-0" : "-translate-x-full"}

lg:translate-x-0
`}
>

{/* Logo */}

<div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between">

<div>

<h1 className="text-xl font-bold text-gray-900">
Sylph AI
</h1>

<p className="text-xs text-gray-500 mt-1">
AI Automation Platform
</p>

</div>

{/* Close button mobile */}

<button
onClick={()=>setOpen(false)}
className="lg:hidden"
>
<X size={20}/>
</button>

</div>


{/* Navigation */}

<nav className="flex-1 px-3 py-6 space-y-1">

{menu.map((item)=>{

const Icon = item.icon
const active = pathname === item.href

return(

<Link
key={item.name}
href={item.href}
className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition relative

${active
? "bg-blue-50 text-blue-600"
: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
}
`}
>

{active && (
<span className="absolute left-0 top-0 h-full w-1 bg-blue-600 rounded-r-md"/>
)}

<Icon size={18}/>

{item.name}

</Link>

)

})}

</nav>


{/* Footer */}

<div className="p-4 border-t border-gray-100 space-y-3">

<div className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-600">

<p className="font-medium text-gray-800">
Free Plan
</p>

<p className="text-gray-500 mt-1">
Upgrade to unlock automation
</p>

</div>

<p className="text-xs text-gray-400 text-center">
Sylph AI v1.0
</p>

</div>

</aside>

</>

)

}