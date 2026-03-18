"use client"

import BookingLayout from "@/components/booking/BookingLayout"
import FeatureGate from "@/components/FeatureGate" // ✅ ADD

export default function BookingPage(){

return(

<div className="space-y-6">

  {/* HEADER */}
  <div>

    <h1 className="text-lg font-semibold text-gray-900">
      Booking
    </h1>

    <p className="text-sm text-gray-500 mt-1">
      Manage your calendar availability and appointments
    </p>

  </div>

  {/* 🔒 FULL LOCK */}
  <FeatureGate feature="AI_BOOKING_SCHEDULING">
    <BookingLayout/>
  </FeatureGate>

</div>

)

}