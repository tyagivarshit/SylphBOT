"use client"

import { User, Mail } from "lucide-react"
import { useState } from "react"

export default function ProfileForm() {

const [name,setName] = useState("User")
const email = "user@email.com"

return(

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 max-w-lg">

{/* Header */}

<div>

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
Profile Information
</h3>

<p className="text-sm text-gray-500 mt-1">
Update your personal account details
</p>

</div>


{/* Avatar */}

<div className="flex items-center gap-4">

<div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center text-white font-semibold shadow-sm">
{name.charAt(0).toUpperCase()}
</div>

<button className="text-sm font-semibold text-gray-700 bg-blue-50 px-3 py-1.5 rounded-lg hover:shadow-sm transition">
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
value={name}
onChange={(e)=>setName(e.target.value)}
placeholder="Full Name"
className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
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
value={email}
disabled
className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-500 bg-gray-100 cursor-not-allowed"
/>

</div>

<p className="text-xs text-gray-500">
Email cannot be changed.
</p>

</div>


{/* Button */}

<button className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:shadow-lg transition">
Update Profile
</button>

</div>

)

}