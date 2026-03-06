export default function StageBadge({ stage }: { stage: string }) {

  const colors: any = {
    NEW: "bg-blue-100 text-blue-600",
    QUALIFIED: "bg-yellow-100 text-yellow-700",
    WON: "bg-green-100 text-green-700",
    LOST: "bg-red-100 text-red-600",
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[stage]}`}>
      {stage}
    </span>
  )
}