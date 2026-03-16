"use client"

import { useEffect, useState } from "react"
import { getDashboardStats, getRecentLeads } from "@/lib/dashboard"

import StatCard from "@/components/cards/StatCard"
import UsageProgress from "@/components/cards/UsageProgress"
import LeadsTable from "@/components/leads/LeadsTable"
import LeadsChart from "@/components/charts/LeadsCharts"
import QuickActions from "@/components/dashboard/QuickActions"

import {
Users,
Zap,
BarChart3,
TrendingUp
} from "lucide-react"

export default function DashboardPage(){

const [stats,setStats] = useState<Record<string, any>>({})
const [leads,setLeads] = useState<any[]>([])
const [chart,setChart] = useState<any[]>([])
const [messagesChart,setMessagesChart] = useState<any[]>([])
const [loading,setLoading] = useState(true)

const loadData = async()=>{

try{

const [statsData, leadsData] = await Promise.all([
getDashboardStats(),
getRecentLeads()
])

const data = statsData?.data || statsData || {}

setStats(data)

setChart(Array.isArray(data.chartData) ? data.chartData : [])

setMessagesChart(Array.isArray(data.messagesChart) ? data.messagesChart : [])

setLeads(leadsData?.data || leadsData || [])

}catch(err){

console.error("Dashboard load error:",err)

}finally{

setLoading(false)

}

}

useEffect(()=>{

loadData()

const interval = setInterval(loadData,10000)

return ()=> clearInterval(interval)

},[])

if(loading){

return (

<div className="space-y-6">

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

{Array.from({length:4}).map((_,i)=>(

<div
key={i}
className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"
/>
))}

</div>

<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

{Array.from({length:3}).map((_,i)=>(

<div
key={i}
className="h-72 bg-white border border-gray-200 rounded-xl animate-pulse"
/>
))}

</div>

</div>

)

}

return(

<div className="space-y-8">

{/* ===== STATS ===== */}

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

<StatCard
title="Total Leads"
value={stats?.totalLeads ?? 0}
icon={<Users size={18}/>}
/>

<StatCard
title="Leads Today"
value={stats?.leadsToday ?? 0}
icon={<BarChart3 size={18}/>}
/>

<StatCard
title="Messages Today"
value={stats?.messagesToday ?? 0}
icon={<TrendingUp size={18}/>}
/>

<StatCard
title="AI Messages Sent"
value={stats?.aiCallsUsed ?? 0}
icon={<Zap size={18}/>}
/>

</div>
{/* ===== QUICK ACTIONS ===== */}

<QuickActions />

{/* ===== CHARTS ===== */}

<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
Leads Growth
</h3>

<LeadsChart data={chart}/>

</div>

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
Messages Growth
</h3>

<LeadsChart
data={messagesChart.map((d:any)=>({
date:d.date,
leads:d.messages
}))}
/>

</div>

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
AI Usage
</h3>

<UsageProgress
used={stats?.aiCallsUsed ?? 0}
limit={stats?.aiCallsLimit ?? 1}
/>

</div>

</div>

{/* ===== RECENT LEADS ===== */}

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
Recent Leads
</h3>

<LeadsTable leads={leads}/>

</div>

</div>

)

}
