"use client"

export default function CreateAutomationModal({ open,onClose }: any){

if(!open) return null

return(

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg">

<h2 className="text-base font-semibold text-gray-900 mb-5">
Create Automation
</h2>

<label className="text-sm font-medium text-gray-800">
Automation Name
</label>

<input
placeholder="Enter automation name"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<div className="flex justify-end gap-3 mt-6">

<button
onClick={onClose}
className="text-sm text-gray-700 hover:text-gray-900"

>

Cancel </button>

<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
Create
</button>

</div>

</div>

</div>

)

}
