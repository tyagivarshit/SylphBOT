"use client"

import { useEffect, useState } from "react"
import { buildApiUrl } from "@/lib/url"

export default function UsageMeter(){

  const [usage,setUsage] = useState<any>(null)

  useEffect(()=>{
    fetch(buildApiUrl("/api/usage"), { credentials: "include", cache: "no-store" })
      .then(res=>res.json())
      .then(setUsage)
  },[])

  if(!usage) return null

  const used = usage?.usage?.ai?.used || 0
  const limit = usage?.usage?.ai?.dailyLimit || 0
  const percent = limit > 0 ? (used / limit) * 100 : 0

  return (
    <div className="bg-gray-50 border rounded-lg p-3 text-xs">

      <p className="font-medium">
        AI Usage: {used} / {limit}
      </p>

      <div className="w-full h-2 bg-gray-200 rounded mt-2">
        <div
          className="h-2 bg-blue-500 rounded"
          style={{ width: `${percent}%` }}
        />
      </div>

    </div>
  )
}
