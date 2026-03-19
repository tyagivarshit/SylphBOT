"use client"

import { useState } from "react"
import ConversationList from "./ConversationList"
import ConversationChat from "./ConversationChat"

export default function ConversationsLayout(){

  const [activeConversation,setActiveConversation] = useState<any>(null)

  return(

    <div className="h-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

      <div className="h-full grid md:grid-cols-12">

        {/* LEFT : CHAT LIST */}

        <div
          className={`${
            activeConversation ? "hidden md:flex" : "flex"
          } md:col-span-4 border-r border-gray-200 flex-col`}
        >

          <ConversationList onSelect={(c:any)=>setActiveConversation(c)} />

        </div>

        {/* RIGHT : CHAT */}

        <div
          className={`${
            activeConversation ? "flex" : "hidden md:flex"
          } md:col-span-8 flex-col`}
        >

          {activeConversation ? (

            <ConversationChat
              conversation={activeConversation}
              onBack={()=>setActiveConversation(null)}
            />

          ) : (

            <div className="h-full flex flex-col items-center justify-center text-gray-600 text-sm">

              <div className="text-lg font-medium text-gray-800 mb-1">
                No conversation selected
              </div>

              <p className="text-gray-500">
                Select a chat to start messaging
              </p>

            </div>

          )}

        </div>

      </div>

    </div>

  )

}