"use client"

import { useState } from "react"
import { Send } from "lucide-react"

export default function ChatInput({ leadId }: { leadId: string }){

  const [message,setMessage] = useState("")
  const [loading,setLoading] = useState(false)

  const handleSend = async () => {

    if(!message.trim() || !leadId) return

    try {

      setLoading(true)

      await fetch("http://localhost:5000/api/messages/send",{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        credentials:"include",
        body: JSON.stringify({
          leadId,
          content: message
        })
      })

      setMessage("")

    } catch (error) {
      console.error("Send message error:", error)
    } finally {
      setLoading(false)
    }
  }

  return(

    <div className="border-t border-gray-200 bg-white px-4 py-3">

      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition">

        {/* INPUT */}

        <input
          value={message}
          onChange={(e)=>setMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-500 px-2"
          onKeyDown={(e)=>{
            if(e.key === "Enter"){
              handleSend()
            }
          }}
        />

        {/* SEND BUTTON */}

        <button
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
            message.trim()
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Send size={16}/>
        </button>

      </div>

    </div>

  )

}