"use client"

import { useState } from "react"

export default function AutomationToggle() {

  const [autoReply, setAutoReply] = useState(true)
  const [followup, setFollowup] = useState(true)

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <h3 className="font-semibold">
        Automation
      </h3>

      <div className="flex justify-between">

        <p className="text-sm">Auto Reply</p>

        <input
          type="checkbox"
          checked={autoReply}
          onChange={() => setAutoReply(!autoReply)}
        />

      </div>

      <div className="flex justify-between">

        <p className="text-sm">Follow-up Messages</p>

        <input
          type="checkbox"
          checked={followup}
          onChange={() => setFollowup(!followup)}
        />

      </div>

    </div>
  )
}