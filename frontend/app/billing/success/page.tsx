"use client"

import { useRouter } from "next/navigation"
import { CheckCircle } from "lucide-react"

export default function SuccessPage(){

const router = useRouter()

return(

<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white px-6">

<div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">

{/* ICON */}

<div className="flex justify-center">
<div className="bg-green-100 p-4 rounded-full">
<CheckCircle className="text-green-600 w-10 h-10"/>
</div>
</div>

{/* TITLE */}

<h1 className="text-2xl font-bold text-gray-900">
Payment Successful 🎉
</h1>

<p className="text-gray-600 text-sm">
Your subscription is now active. You can start using all premium features.
</p>

{/* INFO BOX */}

<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
✔ Instant access unlocked  
<br/>
✔ AI automation activated  
<br/>
✔ Billing cycle started  
</div>

{/* BUTTONS */}

<div className="space-y-3">

<button
onClick={()=>router.push("/dashboard")}
className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium"
>
Go to Dashboard
</button>

<button
onClick={()=>router.push("/billing")}
className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 rounded-lg font-medium"
>
View Billing
</button>

</div>

{/* FOOTER */}

<p className="text-xs text-gray-400">
Need help? Contact support anytime
</p>

</div>

</div>

)
}