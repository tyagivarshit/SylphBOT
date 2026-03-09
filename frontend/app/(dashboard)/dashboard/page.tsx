"use client"

import { useEffect, useState } from "react"
import { getDashboardStats, getRecentLeads } from "@/lib/dashboard"

import StatCard from "@/components/cards/StatCard"
import UsageProgress from "@/components/cards/UsageProgress"
import LeadsTable from "@/components/leads/LeadsTable"
import LeadsChart from "@/components/charts/LeadsCharts"
import RecentActivity from "@/components/dashboard/RecentActivity"

import {
Users,
Zap,
BarChart3,
TrendingUp
} from "lucide-react"

export default function DashboardPage(){

const [stats,setStats] = useState<any>({})
const [leads,setLeads] = useState<any[]>([])
const [chart,setChart] = useState<any[]>([])
const [activity,setActivity] = useState<any[]>([])
const [loading,setLoading] = useState(true)

const loadData = async()=>{

try{

const statsData = await getDashboardStats()
const leadsData = await getRecentLeads()

const data = statsData?.data || statsData || {}

setStats(data)
setChart(data.chartData || [])
setActivity(data.recentActivity || [])
setLeads(leadsData?.data || leadsData || [])

}catch(err){

console.error(err)

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

return <p className="p-6 text-sm text-gray-900">Loading dashboard...</p>

}

return(

<div className="space-y-8 p-4 md:p-6">

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

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
title="Qualified Leads"
value={stats?.qualifiedLeads || 0}
icon={<TrendingUp size={18}/>}
/>

<StatCard
title="AI Calls Used"
value={stats?.aiCallsUsed || 0}
icon={<Zap size={18}/>}
/>

</div>

<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
Leads Growth
</h3>

<LeadsChart data={chart}/>

</div>

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
AI Usage
</h3>

<UsageProgress
used={stats?.aiCallsUsed || 0}
limit={stats?.aiCallsLimit || 1}
/>

</div>

</div>

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md">

<h3 className="text-sm font-semibold text-gray-900 mb-4">
Recent Leads
</h3>

<LeadsTable leads={leads}/>

</div>

<RecentActivity activity={activity}/>

</div>

)

}