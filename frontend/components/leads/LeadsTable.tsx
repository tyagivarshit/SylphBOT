"use client"

import { useState } from "react"
import StageBadge from "./StageBadge"
import LeadDrawer from "./LeadDrawer"

export default function LeadsTable({ leads }: any) {

  const [selectedLead, setSelectedLead] = useState<any>(null)

  return (
    <div className="relative">

      <div className="bg-white border rounded-xl overflow-hidden">

        <table className="w-full">

          <thead className="bg-gray-50 text-left text-sm">
            <tr>
              <th className="p-4">Name</th>
              <th>Platform</th>
              <th>Stage</th>
              <th>Last Message</th>
            </tr>
          </thead>

          <tbody>

            {Array.isArray(leads) && leads.map((lead:any)=> (
              <tr
                key={lead.id}
                className="border-t hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedLead(lead)}
              >

                <td className="p-4 font-medium">
                  {lead.name}
                </td>

                <td className="text-sm text-gray-600">
                  {lead.platform}
                </td>

                <td>
                  <StageBadge stage={lead.stage} />
                </td>

                <td className="text-sm text-gray-500">
                  {lead.lastMessage}
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

      {/* Lead Drawer */}

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

    </div>
  )
}