"use client"

import { useState } from "react"
import { Send } from "lucide-react"

export default function ChatInput(){

const [message,setMessage] = useState("")

return(

<div className="border-t border-gray-200 bg-white p-4 flex items-center gap-2">

<input
value={message}
onChange={(e)=>setMessage(e.target.value)}
placeholder="Type a message..."
className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
/>

<button
className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center transition shadow-sm"

>

<Send size={16}/>

</button>

</div>

)

}
