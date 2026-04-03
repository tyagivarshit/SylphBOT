"use client"

export default function KnowledgeCard({ item, onDelete, onEdit }: any){

  return(

    <div className="border border-blue-100 rounded-2xl p-5 bg-white/80 backdrop-blur-xl shadow-sm hover:shadow-lg transition">

      <div className="flex justify-between items-center gap-3">

        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {item.title}
        </h3>

        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-gray-700 font-semibold whitespace-nowrap">
          {item.sourceType || "TEXT"}
        </span>

      </div>

      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
        {item.content}
      </p>

      <div className="flex gap-4 mt-5">

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