"use client"

import { useState } from "react"
import { createCheckout } from "@/lib/billing"

export default function BillingPage(){

  const [loading,setLoading] = useState(false)

  const handleUpgrade = async(plan:string)=>{

    try{

      setLoading(true)

      const res = await createCheckout(plan)

      if(res?.url){
        window.location.href = res.url
      }

    }catch(err){

      console.error("Checkout error",err)

    }finally{

      setLoading(false)

    }

  }

  return(

    <div className="space-y-8">

      <h1 className="text-2xl font-semibold">
        Billing
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* BASIC PLAN */}

        <div className="bg-white border rounded-xl p-6">

          <h2 className="text-lg font-medium mb-2">
            Basic
          </h2>

          <p className="text-gray-500 mb-4">
            1,000 AI replies / month
          </p>

          <button
            onClick={()=>handleUpgrade("BASIC")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Upgrade
          </button>

        </div>

        {/* PRO PLAN */}

        <div className="bg-white border rounded-xl p-6">

          <h2 className="text-lg font-medium mb-2">
            Pro
          </h2>

          <p className="text-gray-500 mb-4">
            10,000 AI replies / month
          </p>

          <button
            onClick={()=>handleUpgrade("PRO")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Upgrade
          </button>

        </div>

        {/* ENTERPRISE */}

        <div className="bg-white border rounded-xl p-6">

          <h2 className="text-lg font-medium mb-2">
            Enterprise
          </h2>

          <p className="text-gray-500 mb-4">
            Unlimited automation
          </p>

          <button
            onClick={()=>handleUpgrade("ENTERPRISE")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Contact Sales
          </button>

        </div>

      </div>

    </div>

  )

}