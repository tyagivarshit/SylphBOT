"use client"

export default function BookedAppointments(){

const bookings = [
{
name:"Rahul Sharma",
date:"21 Mar 2026",
time:"10:00 AM"
},
{
name:"Priya Verma",
date:"22 Mar 2026",
time:"2:00 PM"
}
]

return(

<div className="bg-white border border-gray-200 rounded-xl p-5">

<h2 className="text-sm font-semibold text-gray-900 mb-4">
Booked Appointments
</h2>

<div className="space-y-3">

{bookings.map((b,i)=>(

<div
key={i}
className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center"
>

<div>

<p className="text-sm font-medium text-gray-900">
{b.name}
</p>

<p className="text-xs text-gray-600">
{b.date} • {b.time}
</p>

</div>

</div>

))}

</div>

</div>

)

}
