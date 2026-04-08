"use client"

export default function KnowledgeCard({ item, onDelete, onEdit }: any){

  return(

    <div className="overflow-hidden border border-blue-100 rounded-2xl p-4 sm:p-5 bg-white/80 backdrop-blur-xl shadow-sm hover:shadow-lg transition">

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between">

        <div className="min-w-0 w-full">
          <h3 className="text-sm font-semibold leading-5 text-gray-900 break-words">
            {item.title}
          </h3>
        </div>

        <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-gray-700 font-semibold whitespace-nowrap">
          {item.sourceType || "TEXT"}
        </span>

      </div>

      <p className="mt-2 text-xs text-gray-500 break-words line-clamp-3">
        {item.content}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 sm:gap-4">

        <button 
          onClick={()=>onEdit(item)}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
        >
          Edit
        </button>

        <button 
          onClick={()=>onDelete(item.id)}
          className="text-sm font-semibold text-red-600 hover:text-red-700 transition"
        >
          Delete
        </button>

      </div>

    </div>

  )

}
