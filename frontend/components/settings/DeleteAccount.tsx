"use client"

export default function DeleteAccount() {

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4 border-red-200">

      <h3 className="font-semibold text-red-600">
        Delete Account
      </h3>

      <p className="text-sm text-gray-500">
        This action cannot be undone.
      </p>

      <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
        Delete My Account
      </button>

    </div>
  )
}