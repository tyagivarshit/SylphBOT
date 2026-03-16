"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
LayoutDashboard,
Users,
MessageSquare,
Workflow,
Brain,
BookOpen,
Calendar,
BarChart3,
CreditCard,
Settings,
MessageCircle,
X
} from "lucide-react"

const menu = [

{
section: "Overview",
items: [
{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
]
},

{
section: "CRM",
items: [
{ name: "Leads", href: "/leads", icon: Users },
{ name: "Conversations", href: "/conversations", icon: MessageCircle },
]
},

{
section: "Automation",
items: [
{ name: "Automation", href: "/automation", icon: Workflow },
{ name: "Comment Automation", href: "/comment-automation", icon: MessageSquare },
]
},

{
section: "AI",
items: [
{ name: "AI Training", href: "/ai-training", icon: Brain },
{ name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
]
},

{
section: "Business",
items: [
{ name: "Booking", href: "/booking", icon: Calendar },
{ name: "Analytics", href: "/analytics", icon: BarChart3 },
{ name: "Billing", href: "/billing", icon: CreditCard },
]
},

{
section: "System",
items: [
{ name: "Settings", href: "/settings", icon: Settings },
]
}

]

export default function Sidebar({
open,
setOpen
}:any){

const pathname = usePathname()

return(

<>

{/* Mobile Overlay */}

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

<button
onClick={()=>setOpen(false)}
className="lg:hidden"

>

<X size={20}/>
</button>

</div>

{/* Navigation */}

<nav className="flex-1 overflow-y-auto px-3 py-6 space-y-6">

{menu.map((group)=>{

return(

<div key={group.section}>

<p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">

{group.section}

</p>

<div className="space-y-1">

{group.items.map((item)=>{

const Icon = item.icon
const active = pathname.startsWith(item.href)

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

{active && ( <span className="absolute left-0 top-0 h-full w-1 bg-blue-600 rounded-r-md"/>
)}

<Icon size={18}/>

{item.name}

</Link>

)

})}

</div>

</div>

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
Upgrade to unlock AI automation
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
