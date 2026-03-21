"use client"

import { ReactNode } from "react"
import { Zap, MessageSquare } from "lucide-react"

/* ================= TYPES ================= */

type Item = {
  label: string
  icon: ReactNode
  used: number
  limit: number | null
}

type Props = {
  aiUsed?: number
  aiLimit?: number | null
  msgUsed?: number
  msgLimit?: number | null
}

/* ================= COMPONENT ================= */

export default function UsageSummary({
  aiUsed = 0,
  aiLimit = null,
  msgUsed = 0,
  msgLimit = null
}: Props) {

  const items: Item[] = [
    {
      label: "AI Calls",
      icon: <Zap size={16} />,
      used: aiUsed,
      limit: aiLimit
    },
    {
      label: "Messages",
      icon: <MessageSquare size={16} />,
      used: msgUsed,
      limit: msgLimit
    }
  ]

  return (

    <div className="bg-white rounded-xl p-6 border shadow-sm space-y-5">

      <h3 className="font-semibold">Usage</h3>

      {items.map((item) => {

        const percent = item.limit
          ? Math.min((item.used / item.limit) * 100, 100)
          : 100

        return (

          <div key={item.label}>

            <div className="flex justify-between text-sm mb-1">
              <span>{item.label}</span>
              <span>
                {item.limit
                  ? `${item.used}/${item.limit}`
                  : "Unlimited"}
              </span>
            </div>

            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-2 bg-blue-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>

          </div>

        )

      })}

    </div>

  )
}