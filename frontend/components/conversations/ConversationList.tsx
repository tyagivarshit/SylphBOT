"use client"

export default function ConversationList({ onSelect }: any){

const conversations = [
{
id:"1",
name:"Rahul Sharma",
lastMessage:"Price kya hai?",
time:"2m",
unread:2
},
{
id:"2",
name:"Priya Verma",
lastMessage:"Booking karni hai",
time:"10m",
unread:0
}
]

return(

<div className="h-full flex flex-col bg-white">

{/* HEADER */}

<div className="p-4 border-b border-gray-200">

<h2 className="text-sm font-semibold text-gray-900">
Conversations
</h2>

</div>

{/* LIST */}

<div className="flex-1 overflow-y-auto">

{conversations.map((c)=>(

<div
key={c.id}
onClick={()=>onSelect(c)}
className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
>

<div className="flex items-center justify-between">

<div className="flex items-center gap-3">

<div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
{c.name.charAt(0)}
</div>

<div className="flex flex-col">

<span className="font-medium text-sm text-gray-900">
{c.name}
</span>

<p className="text-xs text-gray-600 truncate max-w-[180px]">
{c.lastMessage}
</p>

</div>

</div>

<div className="flex flex-col items-end gap-1">

<span className="text-xs text-gray-500">
{c.time}
</span>

{c.unread > 0 && (

<span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
{c.unread}
</span>

)}

</div>

</div>

</div>

))}

</div>

</div>

)

}
