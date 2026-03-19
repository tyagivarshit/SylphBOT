"use client"

export default function MessageBubble({ message, onDelete }: any){

  const isUser = message.sender === "USER"
  const isDeleted = message.content === "This message was deleted"

  return(

    <div className={`flex ${isUser ? "justify-start" : "justify-end"} group`}>

      <div
        onDoubleClick={()=>onDelete && onDelete(message.id)}
        className={`relative px-4 py-2.5 rounded-2xl text-sm max-w-[75%] break-words shadow-sm transition ${
          isUser
            ? "bg-white border border-gray-200 text-gray-900"
            : "bg-blue-600 text-white"
        }`}
      >

        {/* MESSAGE TEXT */}

        <div className={`leading-relaxed ${
          isDeleted ? "italic text-gray-500" : ""
        }`}>
          {isDeleted ? "🚫 Message deleted" : message.text}
        </div>

        {/* TIME + STATUS */}

        <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
          isUser ? "text-gray-600" : "text-blue-100"
        }`}>

          {message.createdAt && (
            <span>
              {new Date(message.createdAt).toLocaleTimeString([],{
                hour:"2-digit",
                minute:"2-digit"
              })}
            </span>
          )}

          {!isUser && !isDeleted && (
            <span className="text-[9px] opacity-80">✓</span>
          )}

        </div>

        {/* DELETE TOOLTIP */}

        {!isDeleted && (
          <div className="absolute -top-6 right-0 text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
            Double click to delete
          </div>
        )}

      </div>

    </div>

  )

}