"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { getLeadDetail } from "@/lib/dashboard.api"
import { apiFetch } from "@/lib/apiClient"
import { socket } from "@/lib/socket"

export default function LeadDrawer({ lead, onClose, onStageUpdate }: any) {

  const [messages,setMessages] = useState<any[]>([])
  const [stage,setStage] = useState(lead?.stage)
  const [typing,setTyping] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  /* AUTO SCROLL */
  useEffect(()=>{
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  },[messages])

  /* LOAD LEAD */
  useEffect(()=>{

    const loadLead = async()=>{

      try{
        const res = await getLeadDetail(lead.id)
        setMessages(res?.data?.messages || [])
      }catch(err){
        console.error("Lead detail load error",err)
      }

    }

    if(lead?.id){
      loadLead()
      setStage(lead.stage)
    }

  },[lead])

  /* SOCKET */
  useEffect(()=>{

    if(!lead?.id) return

    socket.emit("join_conversation",lead.id)

    socket.on("new_message",(msg:any)=>{
      if(msg.leadId === lead.id){
        setMessages((prev)=>[...prev,msg])
      }
    })

    socket.on("typing",(leadId:string)=>{
      if(leadId === lead.id) setTyping(true)
    })

    socket.on("stop_typing",(leadId:string)=>{
      if(leadId === lead.id) setTyping(false)
    })

    return ()=>{
      socket.off("new_message")
      socket.off("typing")
      socket.off("stop_typing")
    }

  },[lead])

  /* UPDATE STAGE */
  const updateStage = async(newStage:string)=>{

    try{
      setStage(newStage)

      await apiFetch(`/api/dashboard/leads/${lead.id}/stage`,{
        method:"PATCH",
        body:JSON.stringify({ stage:newStage }),
        headers:{ "Content-Type":"application/json" }
      })

      onStageUpdate?.(lead.id,newStage)

    }catch(err){
      console.error("Stage update error",err)
    }

  }

  let lastDate = ""

  return(

    <div className="fixed inset-0 z-50 flex justify-end">

      {/* OVERLAY */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* DRAWER */}
      <div className="relative w-full sm:w-[420px] h-full bg-white border-l shadow-xl flex flex-col">

        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b">

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-white text-sm font-semibold">
              {lead?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {lead?.name || "Lead"}
              </h2>
              <p className="text-xs text-gray-600">
                Live conversation
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

        {/* CHAT */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 bg-[#f7fbff]">

          {messages.length > 0 ? (

            messages.map((msg:any)=>{

              const isUser = msg.sender === "USER"

              const date = new Date(msg.createdAt).toDateString()
              const showDate = date !== lastDate
              lastDate = date

              return(

                <div key={msg.id}>

                  {showDate && (
                    <div className="text-center text-[11px] text-gray-500 my-3">
                      {date}
                    </div>
                  )}

                  <div className={`flex ${isUser ? "" : "justify-end"}`}>

                    <div
                      className={`px-4 py-2 rounded-xl text-sm max-w-[80%] break-words ${
                        isUser
                          ? "bg-white text-gray-900 border shadow-sm"
                          : "bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white"
                      }`}
                    >

                      {msg.content}

                      <div
                        className={`text-[10px] mt-1 ${
                          isUser
                            ? "text-gray-500"
                            : "text-white/80 text-right"
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </div>

                    </div>

                  </div>

                </div>

              )

            })

          ) : (

            <div className="text-center text-sm text-gray-500 py-10">
              No conversation yet 🚀
            </div>

          )}

          {typing && (
            <div className="text-xs text-gray-600 animate-pulse">
              typing...
            </div>
          )}

          <div ref={bottomRef}/>

        </div>

        {/* STAGE */}
        <div className="border-t p-4">

          <label className="text-sm font-medium text-gray-800">
            Lead Stage
          </label>

          <select
            value={stage}
            onChange={(e)=>updateStage(e.target.value)}
            className="mt-2 w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >

            <option value="NEW">NEW</option>
            <option value="QUALIFIED">QUALIFIED</option>
            <option value="WON">WON</option>
            <option value="LOST">LOST</option>

          </select>

        </div>

      </div>

    </div>

  )

}