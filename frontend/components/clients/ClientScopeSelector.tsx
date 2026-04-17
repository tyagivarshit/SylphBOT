"use client"

type ClientScopeSelectorProps = {
  clients: Array<{
    id: string
    platform?: string | null
    pageId?: string | null
    phoneNumberId?: string | null
  }>
  value: string
  onChange: (value: string) => void
  label?: string
  helperText?: string
}

const getClientLabel = (client: {
  platform?: string | null
  pageId?: string | null
  phoneNumberId?: string | null
  id: string
}) => {
  const suffix = client.pageId || client.phoneNumberId || client.id
  const shortSuffix = suffix ? String(suffix).slice(-6) : ""

  return shortSuffix
    ? `${client.platform || "CLIENT"} • ${shortSuffix}`
    : client.platform || "CLIENT"
}

export default function ClientScopeSelector({
  clients,
  value,
  onChange,
  label = "Training Scope",
  helperText = "Choose whether the AI should use shared business training or a specific client scope.",
}: ClientScopeSelectorProps) {
  return (
    <div className="space-y-2 rounded-[24px] border border-slate-200/80 bg-white/82 p-4 shadow-sm">
      <label className="text-sm font-semibold text-slate-800">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
      >
        <option value="">Shared Business Brain</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {getClientLabel(client)}
          </option>
        ))}
      </select>

      <p className="text-xs leading-5 text-slate-500">
        {helperText}
      </p>
    </div>
  )
}
