"use client"

import { useState } from "react"

export default function CreateSlotModal({open,onClose}:any){

const [month,setMonth] = useState("")
const [date,setDate] = useState("")
const [time,setTime] = useState("")

if(!open) return null

return(

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">

<h2 className="text-base font-semibold text-gray-900">
Create Booking Slot
</h2>

{/* Month */}

<div>

<label className="text-sm font-medium text-gray-800">
Month
</label>

<select
value={month}
onChange={(e)=>setMonth(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"

>

<option value="">Select Month</option>
<option>January</option>
<option>February</option>
<option>March</option>
<option>April</option>
<option>May</option>
<option>June</option>
<option>July</option>
<option>August</option>
<option>September</option>
<option>October</option>
<option>November</option>
<option>December</option>

</select>

</div>

{/* Date */}

<div>

<label className="text-sm font-medium text-gray-800">
Date
</label>

<input
type="date"
value={date}
onChange={(e)=>setDate(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
/>

</div>

{/* Time */}

<div>

<label className="text-sm font-medium text-gray-800">
Time
</label>

<input
type="time"
value={time}
onChange={(e)=>setTime(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
/>

</div>

<div className="flex justify-end gap-3 pt-2">

<button
onClick={onClose}
className="text-sm text-gray-700"

>

Cancel </button>

<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
Save Slot
</button>

</div>

</div>

</div>

)

}
