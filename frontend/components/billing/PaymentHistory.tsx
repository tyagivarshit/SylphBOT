"use client"

import { Download } from "lucide-react"

export default function PaymentHistory() {

return(

<div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

{/* HEADER */}

<div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">

<h3 className="text-lg font-semibold text-gray-900">
Payment History
</h3>

<span className="text-xs text-gray-500">
Last transactions
</span>

</div>


{/* TABLE */}

<div className="overflow-x-auto">

<table className="w-full text-sm">

<thead className="text-gray-600 bg-gray-50 border-b">

<tr>

<th className="text-left py-3 px-6 font-medium">
Date
</th>

<th className="text-left font-medium">
Plan
</th>

<th className="text-left font-medium">
Amount
</th>

<th className="text-left font-medium">
Status
</th>

<th className="text-right font-medium pr-6">
Invoice
</th>

</tr>

</thead>


<tbody className="text-gray-700">

{/* Row */}

<tr className="border-t hover:bg-gray-50 transition">

<td className="py-4 px-6">
10 May 2026
</td>

<td className="font-medium">
Pro Plan
</td>

<td className="font-semibold text-gray-900">
₹1999
</td>

<td>

<span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
Paid
</span>

</td>

<td className="text-right pr-6">

<button className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">

<Download size={14}/>

Invoice

</button>

</td>

</tr>


{/* Row */}

<tr className="border-t hover:bg-gray-50 transition">

<td className="py-4 px-6">
10 Apr 2026
</td>

<td className="font-medium">
Pro Plan
</td>

<td className="font-semibold text-gray-900">
₹1999
</td>

<td>

<span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
Paid
</span>

</td>

<td className="text-right pr-6">

<button className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">

<Download size={14}/>

Invoice

</button>

</td>

</tr>

</tbody>

</table>

</div>

</div>

)

}