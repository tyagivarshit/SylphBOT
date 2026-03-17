"use client"

import { useEffect, useState } from "react"

export default function UsageMeter(){

  const [usage,setUsage] = useState<any>(null)

  useEffect(()=>{
    fetch("/api/usage", { credentials: "include" })
      .then(res=>res.json())
      .then(setUsage)
  },[])

  if(!usage) return null

  const percent = (usage.used / usage.limit) * 100

  return (
    <div className="bg-gray-50 border rounded-lg p-3 text-xs">

      <p className="font-medium">
        AI Usage: {usage.used} / {usage.limit}
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