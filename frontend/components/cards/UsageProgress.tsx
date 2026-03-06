export default function UsageProgress({ label, used, limit }: any) {
  const percent = (used / limit) * 100

  return (
    <div className="bg-white p-6 rounded-xl border">
      <p className="text-sm mb-2">{label}</p>

      <div className="w-full bg-gray-200 rounded h-2">
        <div
          className="bg-blue-500 h-2 rounded"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-xs mt-2 text-gray-500">
        {used} / {limit}
      </p>
    </div>
  )
}