"use client"

import DaySlots from "./DaySlots"
import BookedAppointments from "./BookedAppointments"

export default function BookingLayout(){

return(

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

{/* LEFT SIDE */}

<div className="w-full">
<DaySlots/>
</div>

{/* RIGHT SIDE */}

<div className="w-full">
<BookedAppointments/>
</div>

</div>

)

}
