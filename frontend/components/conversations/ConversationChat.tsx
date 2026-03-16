"use client"

import MessageBubble from "./MessageBubble"
import ChatInput from "./ChatInput"

export default function ConversationChat({ conversation }: any){

const messages = [
{ id:1, sender:"USER", text:"Price kya hai?" },
{ id:2, sender:"AI", text:"Our package starts from 5000 INR." }
]

return(

<div className="h-full flex flex-col">

{/* HEADER */}

<div className="p-4 border-b border-gray-200 bg-white">

<h3 className="text-sm font-semibold text-gray-900">
{conversation?.name || "Conversation"}
</h3>

</div>

{/* MESSAGES */}

<div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">

{messages.length > 0 ? (

messages.map((m)=>( <MessageBubble key={m.id} message={m}/>
))

) : (

<div className="text-sm text-gray-400 text-center mt-10">
No messages yet
</div>

)}

</div>

{/* INPUT */}

<ChatInput/>

</div>

)

}
