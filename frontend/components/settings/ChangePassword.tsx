"use client"

import { useState } from "react"
import { Eye, EyeOff, Lock } from "lucide-react"

export default function ChangePassword() {

const [show,setShow] = useState(false)

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6 max-w-lg">

{/* Header */}

<div>

<h3 className="text-lg font-semibold text-gray-900">
Change Password
</h3>

<p className="text-sm text-gray-500 mt-1">
Update your account password for better security
</p>

</div>


{/* Inputs */}

<div className="space-y-4">

{/* Current Password */}

<div className="relative">

<Lock
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
type={show ? "text" : "password"}
placeholder="Current Password"
className="border border-gray-300 rounded-lg pl-9 pr-10 py-2 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<button
type="button"
onClick={()=>setShow(!show)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
>

{show ? <EyeOff size={16}/> : <Eye size={16}/>}

</button>

</div>


{/* New Password */}

<div className="relative">

<Lock
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
type="password"
placeholder="New Password"
className="border border-gray-300 rounded-lg pl-9 py-2 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>


{/* Confirm Password */}

<div className="relative">

<Lock
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
type="password"
placeholder="Confirm New Password"
className="border border-gray-300 rounded-lg pl-9 py-2 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

</div>


{/* Password Hint */}

<p className="text-xs text-gray-500">
Use at least 8 characters including letters and numbers.
</p>


{/* Button */}

<button className="bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-5 py-2 rounded-lg">

Update Password

</button>

</div>

)

}