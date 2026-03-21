"use client"

type Invoice = {
id: string
amount_paid?: number
currency?: string
created?: number
status?: string
hosted_invoice_url?: string
invoice_pdf?: string
}

export default function PaymentHistory({ invoices = [] }: { invoices: Invoice[] }){

const getStatusColor = (status?:string)=>{
  switch(status){
    case "paid":
      return "bg-green-100 text-green-700"
    case "open":
      return "bg-yellow-100 text-yellow-700"
    case "void":
      return "bg-gray-200 text-gray-700"
    case "uncollectible":
      return "bg-red-100 text-red-700"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

/* 🔥 SORT LATEST FIRST */
const sorted = [...invoices].sort(
(a,b)=>(b.created || 0) - (a.created || 0)
)

/* 🔥 FORMATTER */
const formatAmount = (amount?:number,currency?:string)=>{
if(!amount) return "-"
return new Intl.NumberFormat("en-US",{
style:"currency",
currency: currency?.toUpperCase() || "USD"
}).format(amount / 100)
}

return(

<div className="bg-white rounded-xl p-6 border border-gray-300 shadow-md">

<h3 className="font-semibold mb-4 text-gray-900">
Payment History
</h3>

<div className="space-y-3">

{/* EMPTY STATE */}

{sorted.length === 0 && (
<p className="text-sm text-gray-600 text-center py-6">
No payments yet
</p>
)}

{sorted.map((inv)=>{

const date = inv.created
? new Date(inv.created * 1000).toLocaleDateString()
: "-"

return(

<div
key={inv.id}
className="flex justify-between items-center border border-gray-200 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition"
>

{/* LEFT */}

<div>
<p className="text-sm font-semibold text-gray-900">
{formatAmount(inv.amount_paid,inv.currency)}
</p>

<p className="text-xs text-gray-600">
{date}
</p>
</div>

{/* RIGHT */}

<div className="flex items-center gap-3">

{/* STATUS */}

<span
className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(inv.status)}`}
>
{inv.status?.toUpperCase() || "UNKNOWN"}
</span>

{/* ACTIONS */}

<div className="flex gap-2">

{inv.hosted_invoice_url && (
<a
href={inv.hosted_invoice_url}
target="_blank"
rel="noopener noreferrer"
className="text-blue-600 text-xs font-medium hover:underline"
>
View
</a>
)}

{inv.invoice_pdf && (
<a
href={inv.invoice_pdf}
target="_blank"
rel="noopener noreferrer"
className="text-green-600 text-xs font-medium hover:underline"
>
Download
</a>
)}

</div>

</div>

</div>

)

})}

</div>

</div>

)
}