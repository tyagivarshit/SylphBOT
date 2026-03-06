"use client"

export default function AddClientModal({ onClose }: any) {

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

      <div className="bg-white p-6 rounded-xl w-96 space-y-4">

        <h2 className="text-lg font-semibold">
          Connect Platform
        </h2>

        <button className="border w-full p-3 rounded-lg">
          Connect WhatsApp
        </button>

        <button className="border w-full p-3 rounded-lg">
          Connect Instagram
        </button>

        <button
          onClick={onClose}
          className="text-sm text-gray-500"
        >
          Cancel
        </button>

      </div>

    </div>
  )
}