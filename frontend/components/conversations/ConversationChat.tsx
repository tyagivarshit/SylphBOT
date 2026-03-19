"use client"

import { useEffect, useRef, useState } from "react"
import MessageBubble from "./MessageBubble"
import ChatInput from "./ChatInput"
import io from "socket.io-client"

const socket = io("http://localhost:5000", {
  withCredentials: true
})

export default function ConversationChat({ conversation }: any){

  const [messages,setMessages] = useState<any[]>([])
  const [loading,setLoading] = useState(false)

  const leadId = conversation?.id
  const bottomRef = useRef<HTMLDivElement | null>(null)

  /* ================= AUTO SCROLL ================= */

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  },[messages])

  /* ================= FETCH MESSAGES ================= */

  useEffect(()=>{

    if(!leadId) return

    const fetchMessages = async () => {
      try {

        setLoading(true)

        const res = await fetch(`http://localhost:5000/api/messages/${leadId}`,{
          credentials:"include"
        })

        const data = await res.json()

        setMessages(data.messages || [])

      } catch (error) {
        console.error("Fetch messages error:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()

  },[leadId])

  /* ================= SOCKET ================= */

  useEffect(()=>{

    if(!leadId) return

    socket.emit("join_room", `lead_${leadId}`)

    const handleNewMessage = (msg:any)=>{
      if(msg.leadId === leadId){
        setMessages(prev=>[...prev,msg])
      }
    }

    const handleDelete = (msg:any)=>{
      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id ? { ...m, content: msg.content } : m
        )
      )
    }

    socket.on("new_message", handleNewMessage)
    socket.on("message_deleted", handleDelete)

    return ()=>{
      socket.off("new_message", handleNewMessage)
      socket.off("message_deleted", handleDelete)
    }

  },[leadId])

  /* ================= DELETE MESSAGE ================= */

  const handleDelete = async (messageId: string) => {
    try {

      await fetch(`http://localhost:5000/api/messages/${messageId}`,{
        method:"DELETE",
        credentials:"include"
      })

    } catch (error) {
      console.error("Delete error:", error)
    }
  }

  return(

    <div className="h-full flex flex-col">

      {/* HEADER */}

      <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between">

        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {conversation?.name || "Conversation"}
          </h3>
          <p className="text-xs text-gray-500">
            {conversation?.platform || "Active chat"}
          </p>
        </div>

      </div>

      {/* MESSAGES */}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">

        {loading ? (
          <div className="text-center text-sm text-gray-400">
            Loading messages...
          </div>
        ) : messages.length > 0 ? (

          messages.map((m)=>(
            <div key={m.id} onDoubleClick={()=>handleDelete(m.id)}>
              <MessageBubble message={{
                ...m,
                text: m.content,
                time: new Date(m.createdAt).toLocaleTimeString([],{
                  hour:"2-digit",
                  minute:"2-digit"
                })
              }} />
            </div>
          ))

        ) : (

          <div className="text-sm text-gray-400 text-center mt-10">
            No messages yet
          </div>

        )}

        {/* AUTO SCROLL ANCHOR */}
        <div ref={bottomRef} />

      </div>

      {/* INPUT */}

      {leadId && <ChatInput leadId={leadId}/>}

    </div>

  )

}