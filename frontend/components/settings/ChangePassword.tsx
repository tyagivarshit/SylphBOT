"use client"

export default function ChangePassword() {

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <h3 className="font-semibold">
        Change Password
      </h3>

      <input
        type="password"
        placeholder="Current Password"
        className="border rounded-lg p-2 w-full"
      />

      <input
        type="password"
        placeholder="New Password"
        className="border rounded-lg p-2 w-full"
      />

      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
        Update Password
      </button>

    </div>
  )
}