"use client"

export default function RecentActivity({ activity }: { activity: any[] }) {

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

<h2 className="text-sm font-semibold text-gray-900 mb-5">
Recent Activity
</h2>

{!activity || activity.length === 0 ? (

<div className="text-sm text-gray-400 py-6 text-center">
No activity yet
</div>

) : (

<div className="space-y-4">

{activity.map((item:any)=>(

<div
key={item.id}
className="flex items-start justify-between text-sm text-gray-700"
>

<div className="flex items-start gap-2">

<span className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"/>

<span className="leading-snug">
{item.text}
</span>

</div>

<span className="text-xs text-gray-400 whitespace-nowrap ml-4">

{new Date(item.time).toLocaleTimeString([],{
hour:"2-digit",
minute:"2-digit"
})}

</span>

</div>

))}

</div>

)}

</div>

)

}
