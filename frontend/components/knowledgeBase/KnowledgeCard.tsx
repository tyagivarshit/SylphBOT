"use client"

export default function KnowledgeCard({ item, onDelete, onEdit }: any){

  return(

    <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/84 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5">

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between">

        <div className="min-w-0 w-full">
          <h3 className="text-sm font-semibold leading-5 text-gray-900 break-words">
            {item.title}
          </h3>
        </div>

        <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50/90 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-slate-700">
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
