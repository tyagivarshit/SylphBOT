"use client"

export default function ProfileForm() {

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <h3 className="font-semibold">
        Profile Information
      </h3>

      <input
        type="text"
        placeholder="Full Name"
        className="border rounded-lg p-2 w-full"
      />

      <input
        type="email"
        placeholder="Email"
        disabled
        className="border rounded-lg p-2 w-full bg-gray-100"
      />

      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
        Update Profile
      </button>

    </div>
  )
}