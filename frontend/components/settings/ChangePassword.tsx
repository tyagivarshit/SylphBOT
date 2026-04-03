"use client"

import { useState } from "react"
import { Eye, EyeOff, Lock } from "lucide-react"

export default function ChangePassword() {

const [show,setShow] = useState(false)

const [form,setForm] = useState({
current:"",
password:"",
confirm:""
})

const handleChange=(key:string,value:string)=>{
setForm(prev=>({...prev,[key]:value}))
}

const passwordMatch = form.password && form.confirm && form.password===form.confirm

return(

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 max-w-lg">

{/* Header */}

<div>

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
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
value={form.current}
onChange={(e)=>handleChange("current",e.target.value)}
placeholder="Current Password"
className="w-full px-4 py-2.5 pl-10 pr-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
/>

<button
type="button"
onClick={()=>setShow(!show)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
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
value={form.password}
onChange={(e)=>handleChange("password",e.target.value)}
placeholder="New Password"
className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
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
value={form.confirm}
onChange={(e)=>handleChange("confirm",e.target.value)}
placeholder="Confirm New Password"
className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm text-gray-700 bg-white/70 backdrop-blur-xl placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
/>

</div>

{/* Match Warning */}

{form.confirm && !passwordMatch && (

<p className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-md inline-block">
Passwords do not match
</p>

)}

</div>


{/* Password Hint */}

<p className="text-xs text-gray-500">
Use at least 8 characters including letters and numbers.
</p>


{/* Button */}

<button
disabled={!passwordMatch}
className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:shadow-lg transition disabled:opacity-60"
>
Update Password
</button>

</div>

)

}