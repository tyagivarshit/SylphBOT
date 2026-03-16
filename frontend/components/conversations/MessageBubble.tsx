"use client"

export default function MessageBubble({ message }: any){

const isUser = message.sender === "USER"

return(

<div className={`flex ${isUser ? "" : "justify-end"}`}>

<div
className={`px-4 py-2.5 rounded-xl text-sm max-w-[75%] break-words shadow-sm ${
isUser
? "bg-white border border-gray-200 text-gray-800"
: "bg-blue-600 text-white"
}`}
>

<div className="leading-relaxed">
{message.text}
</div>

{message.time && (

<div
className={`text-[10px] mt-1 ${
isUser
? "text-gray-400"
: "text-blue-200 text-right"
}`}
>
{message.time}
</div>

)}

</div>

</div>

)

}
