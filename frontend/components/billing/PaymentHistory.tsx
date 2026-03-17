"use client"

export default function PaymentHistory({ invoices = [] }: any){

const getStatusColor = (status:string)=>{
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

return(

<div className="bg-white rounded-xl p-6 border border-gray-300 shadow-md">

<h3 className="font-semibold mb-4 text-gray-900">
Payment History
</h3>

<div className="space-y-3">

{invoices.length === 0 && (
<p className="text-sm text-gray-600">
No payments yet
</p>
)}

{invoices.map((inv:any)=>(
  
<div
key={inv.id}
className="flex justify-between items-center border border-gray-200 p-3 rounded-lg bg-gray-50"
>

{/* LEFT */}

<div>
<p className="text-sm font-semibold text-gray-900">
{(inv.amount_paid / 100).toFixed(2)} {inv.currency?.toUpperCase()}
</p>

<p className="text-xs text-gray-600">
{new Date(inv.created * 1000).toLocaleDateString()}
</p>
</div>

{/* RIGHT */}

<div className="flex items-center gap-3">

{/* STATUS */}

<span
className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(inv.status)}`}
>
{inv.status?.toUpperCase()}
</span>

{/* ACTIONS */}

<div className="flex gap-2">

{inv.hosted_invoice_url && (
<a
href={inv.hosted_invoice_url}
target="_blank"
className="text-blue-600 text-xs font-medium hover:underline"
>
View
</a>
)}

{inv.invoice_pdf && (
<a
href={inv.invoice_pdf}
target="_blank"
className="text-green-600 text-xs font-medium hover:underline"
>
Download
</a>
)}

</div>

</div>

</div>

))}

</div>

</div>

)
}