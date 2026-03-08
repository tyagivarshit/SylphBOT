"use client"

import { useState } from "react"

export default function ClientCard({ platform }: any) {

const [active, setActive] = useState(true)

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition flex flex-col gap-5">

{/* HEADER */}

<div className="flex items-center justify-between">

<div className="flex items-center gap-3">

<div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
{platform?.charAt(0)}
</div>

<div>

<h3 className="text-sm font-semibold text-gray-900 capitalize">
{platform}
</h3>

<p className="text-xs text-gray-500">
Messaging platform
</p>

</div>

</div>


<label className="flex items-center gap-2 text-xs text-gray-600">

<span>
Active
</span>

<input
type="checkbox"
checked={active}
onChange={() => setActive(!active)}
className="accent-blue-600 cursor-pointer"
/>

</label>

</div>


{/* DESCRIPTION */}

<p className="text-sm text-gray-600">
Connected automation for {platform}
</p>


{/* ACTION */}

<div className="flex items-center justify-between">

<span className={`text-xs font-medium ${active ? "text-green-600" : "text-gray-400"}`}>
{active ? "Connected" : "Inactive"}
</span>

<button className="text-sm font-medium text-blue-600 hover:text-blue-700">
Manage
</button>

</div>

</div>

)

}