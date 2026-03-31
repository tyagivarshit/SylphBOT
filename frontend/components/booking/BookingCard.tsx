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
    BOOKED: "bg-[#e7f8ef] text-[#1f9254]",
    CANCELLED: "bg-[#fdecec] text-[#c0392b]",
    RESCHEDULED: "bg-[#fff6e5] text-[#b7791f]",
  };

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-2xl bg-[#ffffffcc] backdrop-blur-md border border-[#e8e8e4] shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_25px_rgba(0,0,0,0.06)] transition-all duration-200 cursor-pointer active:scale-[0.98]"
    >
      <div className="flex justify-between items-center">

        {/* LEFT */}
        <div>
          <p className="text-[15px] font-semibold text-[#0f172a]">
            {booking.name}
          </p>

          <p className="text-[13px] text-[#6b7280] mt-1 font-medium">
            {format(booking.startTime)}
          </p>
        </div>

        {/* STATUS */}
        <span
          className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${statusStyles[booking.status]}`}
        >
          {booking.status}
        </span>

      </div>
    </div>
  );
}