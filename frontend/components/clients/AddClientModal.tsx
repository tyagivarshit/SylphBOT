"use client"

import { X } from "lucide-react"

export default function AddClientModal({ onClose }: any) {

return(

<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">

{/* Modal */}

<div className="bg-white rounded-xl shadow-2xl w-[460px] border border-gray-200">

{/* HEADER */}

<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">

<h2 className="text-lg font-semibold text-gray-900">
Connect Platform
</h2>

<button
onClick={onClose}
className="p-1.5 rounded-md hover:bg-gray-100 transition"
>
<X size={18} className="text-gray-500"/>
</button>

</div>


{/* BODY */}

<div className="p-6 space-y-5">

<p className="text-sm text-gray-600">
Connect your messaging platforms to enable AI automation.
</p>


{/* PLATFORMS */}

<div className="space-y-3">

{/* WhatsApp */}

<button className="w-full border border-gray-200 hover:border-green-400 hover:bg-green-50 transition p-4 rounded-lg flex items-center justify-between group">

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center text-green-600 font-semibold">
W
</div>

<div className="flex flex-col items-start">

<span className="font-medium text-gray-900">
WhatsApp
</span>

<span className="text-xs text-gray-500">
Connect WhatsApp Business
</span>

</div>

</div>

<span className="text-sm font-medium text-green-600 opacity-70 group-hover:opacity-100">
Connect
</span>

</button>


{/* Instagram */}

<button className="w-full border border-gray-200 hover:border-pink-400 hover:bg-pink-50 transition p-4 rounded-lg flex items-center justify-between group">

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center text-pink-600 font-semibold">
I
</div>

<div className="flex flex-col items-start">

<span className="font-medium text-gray-900">
Instagram
</span>

<span className="text-xs text-gray-500">
Connect Instagram DMs
</span>

</div>

</div>

<span className="text-sm font-medium text-pink-600 opacity-70 group-hover:opacity-100">
Connect
</span>

</button>

</div>

</div>


{/* FOOTER */}

<div className="flex justify-end px-6 py-4 border-t border-gray-200">

<button
onClick={onClose}
className="text-sm text-gray-500 hover:text-gray-800 transition"
>
Cancel
</button>

</div>

</div>

</div>

)

}