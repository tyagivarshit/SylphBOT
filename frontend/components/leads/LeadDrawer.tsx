"use client"

import { X, User } from "lucide-react"

export default function LeadDrawer({ lead, onClose }: any) {

  return (

    <div className="fixed inset-0 z-50 flex justify-end">

      {/* Overlay */}

      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />

      {/* Drawer */}

      <div className="relative w-96 max-w-full h-full bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-slideIn">

        {/* Header */}

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <User size={18}/>
            </div>

            <div>

              <h2 className="text-base font-semibold text-gray-900">
                {lead?.name || "Lead"}
              </h2>

              <p className="text-xs text-gray-500">
                Lead conversation
              </p>

            </div>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={18}/>
          </button>

        </div>


        {/* Messages */}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Lead message */}

          <div className="flex">

            <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-xl text-sm max-w-[75%]">

              Hi, I want pricing details

              <div className="text-[10px] text-gray-400 mt-1">
                10:21 AM
              </div>

            </div>

          </div>


          {/* AI reply */}

          <div className="flex justify-end">

            <div className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm max-w-[75%]">

              Sure! I'll send it.

              <div className="text-[10px] text-blue-200 mt-1 text-right">
                10:22 AM
              </div>

            </div>

          </div>

        </div>


        {/* Stage Section */}

        <div className="border-t border-gray-200 p-6">

          <label className="text-sm font-medium text-gray-800">
            Lead Stage
          </label>

          <select className="border border-gray-300 w-full rounded-lg px-3 py-2 mt-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">

            <option>NEW</option>
            <option>QUALIFIED</option>
            <option>WON</option>
            <option>LOST</option>

          </select>

        </div>

      </div>

    </div>

  )

}