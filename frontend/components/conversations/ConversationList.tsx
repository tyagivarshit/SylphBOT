"use client"

import { useEffect, useState } from "react"
import io from "socket.io-client"

const socket = io("http://localhost:5000", {
  withCredentials: true
})

export default function ConversationList({ onSelect }: any){

  const [conversations,setConversations] = useState<any[]>([])
  const [loading,setLoading] = useState(false)
  const [search,setSearch] = useState("")

  /* ================= FETCH LEADS ================= */

  const fetchLeads = async () => {
    try {

      setLoading(true)

      const res = await fetch("http://localhost:5000/api/dashboard/leads?limit=50",{
        credentials:"include"
      })

      const data = await res.json()

      setConversations(data.leads || [])

    } catch (error) {
      console.error("Fetch leads error:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    fetchLeads()
  },[])

  /* ================= REALTIME UPDATE ================= */

  useEffect(()=>{

    const handleNewMessage = (msg:any)=>{

      setConversations(prev => {

        const updated = [...prev]

        const index = updated.findIndex(c => c.id === msg.leadId)

        if(index !== -1){

          const convo = { ...updated[index] }

          convo.messages = [...(convo.messages || []), msg]
          convo.lastMessageAt = msg.createdAt
          convo.unreadCount = (convo.unreadCount || 0) + 1

          updated.splice(index,1)
          updated.unshift(convo)

        }

        return updated

      })

    }

    socket.on("new_message", handleNewMessage)

    return ()=>{
      socket.off("new_message", handleNewMessage)
    }

  },[])

  /* ================= FILTER ================= */

  const filtered = conversations.filter((c)=>
    (c.name || "").toLowerCase().includes(search.toLowerCase())
  )

  return(

    <div className="h-full flex flex-col bg-white">

      {/* HEADER */}

      <div className="p-4 border-b border-gray-200 space-y-3">

        <h2 className="text-sm font-semibold text-gray-900">
          Conversations
        </h2>

        {/* SEARCH */}

        <input
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

      </div>

      {/* LIST */}

      <div className="flex-1 overflow-y-auto">

        {loading ? (

          <div className="text-center text-sm text-gray-500 mt-10">
            Loading conversations...
          </div>

        ) : filtered.length > 0 ? (

          filtered.map((c)=>{

            const lastMessage =
              c.messages?.[c.messages.length - 1]?.content || "No messages"

            return(

              <div
                key={c.id}
                onClick={()=>onSelect(c)}
                className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
              >

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    {/* AVATAR */}

                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
                      {(c.name || "U").charAt(0)}
                    </div>

                    {/* INFO */}

                    <div className="flex flex-col">

                      <span className="font-medium text-sm text-gray-900">
                        {c.name || "Unknown"}
                      </span>

                      <p className="text-xs text-gray-600 truncate max-w-[180px]">
                        {lastMessage}
                      </p>

                    </div>

                  </div>

                  {/* RIGHT SIDE */}

                  <div className="flex flex-col items-end gap-1">

                    <span className="text-[10px] text-gray-600">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleTimeString([],{
                            hour:"2-digit",
                            minute:"2-digit"
                          })
                        : ""}
                    </span>

                    {c.unreadCount > 0 && (

                      <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                        {c.unreadCount}
                      </span>

                    )}

                  </div>

                </div>

              </div>

            )

          })

        ) : (

          <div className="text-center text-sm text-gray-500 mt-10">
            No conversations found
          </div>

        )}

      </div>

    </div>

  )

}