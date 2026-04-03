"use client";

export default function BookingCard({ booking, onClick }: any) {
  const format = (d: string) => {
    const date = new Date(d);
    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  const statusStyles: any = {
    BOOKED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-600",
    RESCHEDULED: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div
      onClick={onClick}
      className="p-5 rounded-2xl bg-white/80 backdrop-blur-xl border border-blue-100 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.98]"
    >
      <div className="flex justify-between items-center gap-4">

        {/* 🔥 LEFT */}
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-gray-900">
            {booking.name}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            {format(booking.startTime)}
          </p>
        </div>

        {/* 🔥 STATUS */}
        <span
          className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyles[booking.status]}`}
        >
          {booking.status}
        </span>

      </div>
    </div>
  );
}