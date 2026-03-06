"use client"

export default function LeadDrawer({ lead, onClose }: any) {

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-white border-l p-6 shadow-lg">

      <div className="flex justify-between mb-4">

        <h2 className="text-lg font-semibold">
          {lead.name}
        </h2>

        <button onClick={onClose}>
          Close
        </button>

      </div>

      <div className="space-y-3">

        <div className="bg-gray-100 p-3 rounded-lg w-fit">
          Hi, I want pricing details
        </div>

        <div className="bg-blue-500 text-white p-3 rounded-lg ml-auto w-fit">
          Sure! I'll send it.
        </div>

      </div>

      <div className="mt-6">

        <label className="text-sm">Stage</label>

        <select className="border w-full rounded-lg p-2 mt-1">

          <option>NEW</option>
          <option>QUALIFIED</option>
          <option>WON</option>
          <option>LOST</option>

        </select>

      </div>

    </div>
  )
}