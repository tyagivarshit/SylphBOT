"use client"

import { Download } from "lucide-react"

export default function PaymentHistory({ payments = [] }: any){

return(

<div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

<div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">

<h3 className="text-lg font-semibold text-gray-900">
Payment History
</h3>

<span className="text-xs text-gray-500">
Invoices & Transactions
</span>

</div>

<div className="overflow-x-auto">

<table className="w-full text-sm">

<thead className="bg-gray-50 text-gray-600 border-b">

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

<th className="text-right pr-6 font-medium">
Invoice
</th>

</tr>

</thead>

<tbody className="text-gray-700">

{payments.length === 0 ? (

<tr>

<td colSpan={5} className="text-center py-10 text-gray-500">
No payments yet
</td>

</tr>

) : (

payments.map((p:any)=>{

const statusStyle =
p.status === "paid"
? "bg-green-50 text-green-700"
: "bg-yellow-50 text-yellow-700"

return(

<tr
key={p.id}
className="border-t hover:bg-gray-50"
>

<td className="py-4 px-6">
{p.date}
</td>

<td className="font-medium">
{p.plan}
</td>

<td className="font-semibold text-gray-900">
₹{p.amount}
</td>

<td>

<span className={`px-2 py-1 text-xs rounded-md ${statusStyle}`}>
{p.status} </span>

</td>

<td className="text-right pr-6">

<button className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs ml-auto">

<Download size={14}/>
Invoice

</button>

</td>

</tr>

)

})

)}

</tbody>

</table>

</div>

</div>

)

}
