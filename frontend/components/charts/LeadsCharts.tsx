"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts"

export default function LeadsChart({ data }: { data: any[] }) {

  return (

    <div className="w-full h-56 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm">

      <ResponsiveContainer>

        <LineChart data={data}>

          <CartesianGrid
            stroke="#dbeafe"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="date"
            stroke="#6b7280"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            stroke="#6b7280"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #dbeafe",
              borderRadius: "12px",
              color: "#111827",
              backdropFilter: "blur(8px)"
            }}
          />

          <Line
            type="monotone"
            dataKey="leads"
            stroke="url(#colorGradient)"
            strokeWidth={3}
            dot={{ r: 4, stroke: "#2563eb", strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 6 }}
          />

          {/* Gradient */}
          <defs>
            <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>

        </LineChart>

      </ResponsiveContainer>

    </div>

  )

}