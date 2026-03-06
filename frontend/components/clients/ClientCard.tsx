"use client"

import { useState } from "react"

export default function ClientCard({ platform }: any) {

  const [active, setActive] = useState(true)

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <div className="flex items-center justify-between">

        <h3 className="text-lg font-semibold">
          {platform}
        </h3>

        <label className="flex items-center gap-2 text-sm">

          Active

          <input
            type="checkbox"
            checked={active}
            onChange={() => setActive(!active)}
          />

        </label>

      </div>

      <p className="text-sm text-gray-500">
        Connected automation for {platform}
      </p>

      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
        Manage
      </button>

    </div>
  )
}