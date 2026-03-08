"use client"

import { useState } from "react"
import toast from "react-hot-toast"

export default function ForgotPage(){

const [email,setEmail] = useState("")

const handleReset = ()=>{

if(!email){
toast.error("Enter email")
return
}

toast.success("Reset link sent")

}

return(

<div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-8">

<h1 className="text-xl font-semibold text-center mb-6">
Reset password
</h1>

<input
placeholder="Enter your email"
value={email}
onChange={(e)=>setEmail(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5"
/>

<button
onClick={handleReset}
className="w-full mt-4 bg-blue-600 text-white py-2.5 rounded-lg"
>

Send reset link

</button>

</div>

)

}