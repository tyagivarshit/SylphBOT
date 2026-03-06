import Sidebar from "./Sidebar"
import Topbar from "./Topbar"

export default function DashboardLayout({ children }: any) {
  return (
    <div className="flex">

      <Sidebar />

      <div className="flex-1 bg-gray-50 min-h-screen">

        <Topbar />

        <main className="p-6">
          {children}
        </main>

      </div>

    </div>
  )
}