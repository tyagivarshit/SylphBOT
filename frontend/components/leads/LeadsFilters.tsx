import LeadsTable from "@/components/leads/LeadsTable"

export default function LeadsPage() {

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <h1 className="text-2xl font-semibold">
          Leads
        </h1>

        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Export
        </button>

      </div>

      <LeadsTable />

    </div>
  )
}