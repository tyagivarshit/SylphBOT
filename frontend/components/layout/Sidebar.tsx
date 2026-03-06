"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  CreditCard,
  Settings,
  Brain
} from "lucide-react"

const menu = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: MessageSquare },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "AI Settings", href: "/ai-settings", icon: Brain },
  { name: "Settings", href: "/settings", icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-r h-screen p-6">
      <h1 className="text-xl font-bold mb-8">Sylph AI</h1>

      <nav className="space-y-2">
        {menu.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 p-3 rounded-lg transition
              ${active ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100"}`}
            >
              <Icon size={18} />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}