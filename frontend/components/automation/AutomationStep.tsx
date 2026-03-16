"use client"

export default function AutomationStep({ step }: any){

return(

<div className="border border-gray-200 rounded-lg p-3 bg-white">

<p className="text-xs text-gray-500">
{step.type}
</p>

<p className="text-sm font-medium text-gray-900">
{step.label}
</p>

</div>

)

}
