"use client"

import LeadsTable from "@/components/leads/LeadsTable"
import { Search, Download } from "lucide-react"

export default function LeadsPage() {

return(

<div className="space-y-10">

{/* HEADER */}

<div className="flex items-start justify-between flex-wrap gap-4">

<div>

<h1 className="text-2xl font-semibold text-gray-900">
Leads
</h1>

<p className="text-sm text-gray-600 mt-1">
Manage and track your incoming leads
</p>

</div>

<button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">

<Download size={16}/>

Export

</button>

</div>


{/* STATS STRIP */}

<div className="grid grid-cols-2 md:grid-cols-4 gap-4">

<div className="bg-white border border-gray-200 rounded-xl p-4">
<p className="text-xs text-gray-500">Total Leads</p>
<p className="text-xl font-semibold text-gray-900">124</p>
</div>

<div className="bg-white border border-gray-200 rounded-xl p-4">
<p className="text-xs text-gray-500">New</p>
<p className="text-xl font-semibold text-blue-600">34</p>
</div>

<div className="bg-white border border-gray-200 rounded-xl p-4">
<p className="text-xs text-gray-500">Qualified</p>
<p className="text-xl font-semibold text-green-600">21</p>
</div>

<div className="bg-white border border-gray-200 rounded-xl p-4">
<p className="text-xs text-gray-500">Won</p>
<p className="text-xl font-semibold text-purple-600">9</p>
</div>

</div>


{/* SEARCH + FILTER */}

<div className="flex items-center justify-between flex-wrap gap-4">

<div className="relative w-full max-w-sm">

<Search
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
placeholder="Search leads..."
className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

<select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">

<option>All Stages</option>
<option>New</option>
<option>Qualified</option>
<option>Won</option>
<option>Lost</option>

</select>

</div>


{/* TABLE CARD */}

<div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">

<LeadsTable />

</div>

</div>

)

}