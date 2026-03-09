"use client"

export default function RecentActivity({ activity }: { activity: any[] }) {

return(

<div className="bg-white border border-gray-300 rounded-xl p-5 shadow-sm">

<h2 className="text-sm font-semibold text-gray-800 mb-4">
Recent Activity
</h2>

{!activity || activity.length === 0 ? (

<p className="text-sm text-gray-500">
No activity yet
</p>

) : (

<div className="space-y-3">

{activity.map((item:any)=>(

<div
key={item.id}
className="flex items-center justify-between text-sm text-gray-700"
>

<span>
{item.text}
</span>

<span className="text-xs text-gray-400">
{new Date(item.time).toLocaleTimeString()}
</span>

</div>

))}

</div>

)}

</div>

)

}