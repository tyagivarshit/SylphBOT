"use client"

export default function PromptTemplates() {

  return (
    <div className="bg-white border rounded-xl p-6 space-y-3">

      <h3 className="font-semibold">
        Prompt Templates
      </h3>

      <textarea
        className="border rounded-lg p-3 w-full h-24"
        placeholder="Custom AI instructions..."
      />

      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
        Save Prompt
      </button>

    </div>
  )
}