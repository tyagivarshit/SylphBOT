"use client";

export default function StatCard({ stat }: any) {

  const isPositive = stat.change?.includes("+");

  return (
    <div className="relative bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition overflow-hidden">
      
      {/* 🔥 subtle gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 pointer-events-none" />

      {/* 🔥 CONTENT */}
      <div className="relative z-10">
        
        {/* TITLE */}
        <p className="text-xs font-medium text-gray-500">
          {stat.title}
        </p>

        {/* VALUE + CHANGE */}
        <div className="flex items-end justify-between mt-2">
          
          <p className="text-2xl font-bold text-gray-900 tracking-tight">
            {stat.value}
          </p>

          <span
            className={`text-xs font-semibold px-2 py-1 rounded-md ${
              isPositive
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-600"
            }`}
          >
            {stat.change}
          </span>

        </div>

      </div>
    </div>
  );
}