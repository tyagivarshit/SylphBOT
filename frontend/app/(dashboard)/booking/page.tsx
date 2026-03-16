"use client"

import BookingLayout from "@/components/booking/BookingLayout"

export default function BookingPage(){

return(

<div className="space-y-6">

<div>

<h1 className="text-lg font-semibold text-gray-900">
Booking
</h1>

<p className="text-sm text-gray-500 mt-1">
Manage your calendar availability and appointments
</p>

</div>

<BookingLayout/>

</div>

)

}
