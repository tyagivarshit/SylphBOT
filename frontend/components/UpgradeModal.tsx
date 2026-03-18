"use client"

import { useState } from "react"
import { X, Check } from "lucide-react"
import { createCheckout } from "@/lib/billing"

type Props = {
  open: boolean
  setOpen: (v: boolean) => void
}

const plans = [
  {
    name: "PRO",
    price: "₹999/mo",
    features: [
      "CRM Access",
      "Leads & Conversations",
      "WhatsApp Automation",
      "Follow-ups"
    ]
  },
  {
    name: "ELITE",
    price: "₹1999/mo",
    features: [
      "Everything in PRO",
      "AI Booking System",
      "Advanced Automation",
      "Priority Support"
    ]
  }
]

export default function UpgradeModal({ open, setOpen }: Props){

  const [loading,setLoading] = useState<string | null>(null)

  if(!open) return null

  const handleUpgrade = async(plan: string)=>{

    try{
      setLoading(plan)

      const res = await createCheckout(plan, "monthly")

      if(res?.url){
        window.location.href = res.url
      }

    }catch(err){
      console.error("Upgrade error:", err)
    }finally{
      setLoading(null)
    }

  }

  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center">

      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={()=>setOpen(false)}
      />

      {/* MODAL */}
      <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in-95">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Upgrade your plan 🚀
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Unlock powerful automation & grow faster
            </p>
          </div>

          <button onClick={()=>setOpen(false)}>
            <X size={20}/>
          </button>

        </div>

        {/* PLANS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {plans.map((plan)=>(
            <div
              key={plan.name}
              className="border rounded-xl p-5 hover:shadow-md transition flex flex-col justify-between"
            >

              <div>

                <h3 className="text-lg font-semibold text-gray-900">
                  {plan.name}
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  {plan.price}
                </p>

                <ul className="mt-4 space-y-2 text-sm text-gray-600">

                  {plan.features.map((f,i)=>(
                    <li key={i} className="flex items-center gap-2">
                      <Check size={14} className="text-green-600"/>
                      {f}
                    </li>
                  ))}

                </ul>

              </div>

              {/* CTA */}
              <button
                onClick={()=>handleUpgrade(plan.name)}
                disabled={loading === plan.name}
                className="mt-5 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading === plan.name ? "Redirecting..." : "Upgrade Now"}
              </button>

            </div>
          ))}

        </div>

      </div>

    </div>

  )

}