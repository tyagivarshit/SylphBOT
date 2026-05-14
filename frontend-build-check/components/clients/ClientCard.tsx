"use client"

import { useState } from "react"

export default function ClientCard({ platform }: any) {

  const [active, setActive] = useState(true)

  return (

    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-lg transition flex flex-col gap-4 sm:gap-5">

      {/* HEADER */}

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3 min-w-0">

          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-sm shrink-0">
            {platform?.charAt(0)}
          </div>

          <div className="min-w-0">

            <h3 className="text-sm font-semibold text-gray-900 capitalize truncate">
              {platform}
            </h3>

            <p className="text-xs text-gray-500">
              Messaging platform
            </p>

          </div>

        </div>


        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">

          <span>Active</span>

          <input
            type="checkbox"
            checked={active}
            onChange={() => setActive(!active)}
            className="accent-blue-600 cursor-pointer"
          />

        </label>

      </div>


      {/* DESCRIPTION */}

      <p className="text-sm text-gray-500">
        Connected automation for {platform}
      </p>


      {/* ACTION */}

      <div className="flex items-center justify-between">

        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          active
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500"
        }`}>
          {active ? "Connected" : "Inactive"}
        </span>

        <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
          Manage
        </button>

      </div>

    </div>

  )

}