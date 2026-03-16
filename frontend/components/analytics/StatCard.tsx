"use client"

export default function StatCard({ stat }: any){

return(

<div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">

<p className="text-xs text-gray-500">
{stat.title}
</p>

<div className="flex items-end justify-between mt-2">

<p className="text-lg font-semibold text-gray-900">
{stat.value}
</p>

<span className="text-xs text-green-600 font-medium">
{stat.change}
</span>

</div>

</div>

)

}
