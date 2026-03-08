export default function StatCard({ title, value, icon, trend }: any) {

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition flex items-center justify-between">

<div>

<p className="text-sm text-gray-500">
{title}
</p>

<h2 className="text-2xl font-semibold text-gray-900 mt-1">
{value}
</h2>

{trend && (
<p className="text-xs text-green-600 mt-1">
{trend}
</p>
)}

</div>

{icon && (

<div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">

{icon}

</div>

)}

</div>

)

}