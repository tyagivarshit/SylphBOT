"use client"

import KnowledgeList from "./KnowledgeList"

export default function KnowledgeBasePage(){

  return(

    <div className="space-y-6">

      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">
          Knowledge Base
        </h1>

        <p className="text-xs text-gray-500 mt-1">
          Manage and organize your AI training knowledge
        </p>
      </div>

      <KnowledgeList/>

    </div>

  )

}