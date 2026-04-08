"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

type StageOption = {
  label: string
  value: string
}

export default function StageSelect({
  value,
  onChange,
  options,
  direction = "down",
  className = "",
  ariaLabel = "Select stage",
}: {
  value: string
  onChange: (value: string) => void
  options: StageOption[]
  direction?: "down" | "up"
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || options[0],
    [options, value]
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white/70 px-4 py-2.5 text-left text-sm text-gray-900 backdrop-blur-xl transition hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <span className="min-w-0 truncate">{selectedOption?.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-30 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-lg ${
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((option) => {
              const active = option.value === value

              return (
                <button
                  key={`${option.label}-${option.value}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center px-4 py-2.5 text-sm transition ${
                    active
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-gray-700 hover:bg-blue-50"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
