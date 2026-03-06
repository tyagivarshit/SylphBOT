export default function StatCard({ title, value }: any) {
  return (
    <div className="bg-white p-6 rounded-xl border">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="text-2xl font-semibold mt-2">{value}</h2>
    </div>
  )
}