"use client"

import { useEffect, useState } from "react"
import { getDashboardStats, getRecentLeads } from "@/lib/dashboard"
import StatCard from "@/components/cards/StatCard"
import UsageProgress from "@/components/cards/UsageProgress"
import LeadsTable from "@/components/leads/LeadsTable"

import {
Users,
MessageSquare,
Zap,
BarChart3
} from "lucide-react"

export default function DashboardPage() {

const [stats, setStats] = useState<any>(null)
const [leads, setLeads] = useState<any[]>([])
const [loading,setLoading] = useState(true)

const loadData = async () => {

try{

const statsData = await getDashboardStats()
const leadsData = await getRecentLeads()

setStats(statsData)
setLeads(leadsData || [])

}catch(err){

console.error("Dashboard load error",err)

}finally{

setLoading(false)

}

}

useEffect(()=>{

loadData()

},[])

const hour = new Date().getHours()

let greeting="Good Morning"
if(hour>12) greeting="Good Afternoon"
if(hour>17) greeting="Good Evening"

if(loading){

return(

<div className="space-y-6 animate-pulse">

<div className="h-6 w-40 bg-gray-300 rounded"/>

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

<div className="h-28 bg-gray-300 rounded-xl"/>
<div className="h-28 bg-gray-300 rounded-xl"/>
<div className="h-28 bg-gray-300 rounded-xl"/>
<div className="h-28 bg-gray-300 rounded-xl"/>

</div>

<div className="h-48 bg-gray-300 rounded-xl"/>
<div className="h-64 bg-gray-300 rounded-xl"/>

</div>

)

}

return(

<div className="space-y-10">

{/* HEADER */}

<div>

<h1 className="text-2xl font-semibold text-gray-900">
{greeting}
</h1>

<p className="text-sm text-gray-600">
Here’s what’s happening with your AI automation today
</p>

</div>


{/* STATS */}

<div>

<h2 className="text-sm font-semibold text-gray-800 mb-4">
Stats
</h2>

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

<StatCard
title="Total Leads"
value={stats?.totalLeads || 0}
icon={<Users size={18}/>}
/>

<StatCard
title="Leads Today"
value={stats?.leadsToday || 0}
icon={<BarChart3 size={18}/>}
/>

<StatCard
title="AI Calls Used"
value={stats?.aiCallsUsed || 0}
icon={<Zap size={18}/>}
/>

<StatCard
title="Active Clients"
value={stats?.activeClients || 0}
icon={<MessageSquare size={18}/>}
/>

</div>

</div>


{/* CHART + USAGE */}

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

<div className="bg-white border border-gray-300 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-800 mb-4">
Leads Growth
</h3>

<div className="h-40 flex items-center justify-center text-gray-500 text-sm">
Chart placeholder
</div>

</div>


<div className="bg-white border border-gray-300 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-800 mb-4">
AI Usage
</h3>

<UsageProgress
used={stats?.aiCallsUsed || 0}
limit={stats?.aiCallsLimit || 1}
/>

<p className="text-xs text-gray-600 mt-2">
{stats?.aiCallsUsed || 0} / {stats?.aiCallsLimit || 0} calls used
</p>

</div>

</div>


{/* RECENT LEADS */}

<div className="bg-white border border-gray-300 rounded-xl p-6 shadow-sm">

<div className="flex items-center justify-between mb-4">

<h2 className="text-sm font-semibold text-gray-800">
Recent Leads
</h2>

</div>

{leads.length===0 ?(

<div className="text-center text-gray-500 text-sm py-10">

No leads yet  
<br/>
Connect WhatsApp or Instagram to start receiving messages

</div>

):(

<LeadsTable leads={leads}/>

)}

</div>


{/* ACTIVITY */}

<div className="bg-white border border-gray-300 rounded-xl p-6 shadow-sm">

<h2 className="text-sm font-semibold text-gray-800 mb-4">
Recent Activity
</h2>

<div className="space-y-3 text-sm text-gray-700">

<p>🤖 AI replied to a lead</p>
<p>📥 New lead captured</p>
<p>⚙️ Client settings updated</p>

</div>

</div>

</div>

)

}