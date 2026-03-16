"use client"

import Link from "next/link"
import {
Workflow,
Brain,
Instagram,
MessageCircle,
Calendar
} from "lucide-react"

const actions = [
{
title: "Create Automation",
desc: "Build a new AI automation flow",
href: "/automation",
icon: Workflow
},
{
title: "Train AI",
desc: "Add knowledge for AI replies",
href: "/ai-training",
icon: Brain
},
{
title: "Connect Instagram",
desc: "Start capturing Instagram leads",
href: "/integrations/instagram",
icon: Instagram
},
{
title: "Connect WhatsApp",
desc: "Enable WhatsApp automation",
href: "/integrations/whatsapp",
icon: MessageCircle
},
{
title: "Add Booking Slot",
desc: "Setup calendar availability",
href: "/booking",
icon: Calendar
}
]

export default function QuickActions(){

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-900 mb-5">
Quick Actions
</h3>

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

{actions.map((action)=>{

const Icon = action.icon

return(

<Link
key={action.title}
href={action.href}
className="flex items-start gap-3 border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition"
>

<div className="p-2 rounded-md bg-blue-100 text-blue-600">
<Icon size={18}/>
</div>

<div>

<p className="text-sm font-medium text-gray-900">
{action.title}
</p>

<p className="text-xs text-gray-500 mt-1">
{action.desc}
</p>

</div>

</Link>

)

})}

</div>

</div>

)

}
