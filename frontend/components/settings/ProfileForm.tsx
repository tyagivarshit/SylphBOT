"use client"

import { User, Mail } from "lucide-react"

export default function ProfileForm() {

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6 max-w-lg">

{/* Header */}

<div>

<h3 className="text-lg font-semibold text-gray-900">
Profile Information
</h3>

<p className="text-sm text-gray-500 mt-1">
Update your personal account details
</p>

</div>


{/* Avatar */}

<div className="flex items-center gap-4">

<div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
U
</div>

<button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
Change Avatar
</button>

</div>


{/* Inputs */}

<div className="space-y-4">

{/* Name */}

<div className="relative">

<User
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
type="text"
placeholder="Full Name"
className="border border-gray-300 rounded-lg pl-9 pr-3 py-2 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>


{/* Email */}

<div className="relative">

<Mail
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
type="email"
placeholder="Email"
disabled
className="border border-gray-200 rounded-lg pl-9 pr-3 py-2 w-full text-sm text-gray-500 bg-gray-100 cursor-not-allowed"
/>

</div>

<p className="text-xs text-gray-500">
Email cannot be changed.
</p>

</div>


{/* Button */}

<button className="bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-5 py-2 rounded-lg">

Update Profile

</button>

</div>

)

}