"use client"

import { useEffect, useState } from "react"

// Next draw: upcoming Sunday 20:00 UTC
function getNextDraw(): Date {
  const now = new Date()
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0, 0, 0),
  )
  const day = target.getUTCDay() // 0 = Sunday
  let add = (7 - day) % 7
  if (add === 0 && now.getTime() >= target.getTime()) add = 7
  target.setUTCDate(target.getUTCDate() + add)
  return target
}

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

export function Countdown() {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const target = getNextDraw().getTime()
    const tick = () => setRemaining(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const total = remaining ?? 0
  const days = Math.floor(total / 86400000)
  const hours = Math.floor((total % 86400000) / 3600000)
  const mins = Math.floor((total % 3600000) / 60000)
  const secs = Math.floor((total % 60000) / 1000)

  const units = [
    { label: "Days", value: pad(days) },
    { label: "Hours", value: pad(hours) },
    { label: "Min", value: pad(mins) },
    { label: "Sec", value: pad(secs) },
  ]

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        <span>Next Draw</span>
        <span className="h-1 w-1 rounded-full bg-gold" />
        <span className="text-foreground">Sunday</span>
        <span className="h-1 w-1 rounded-full bg-gold" />
        <span>20:00 UTC</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex min-w-[58px] flex-col items-center rounded-xl border border-border bg-card/60 px-3 py-2.5 backdrop-blur-sm sm:min-w-[72px]">
              <span
                className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl"
                aria-hidden={remaining === null}
              >
                {remaining === null ? "--" : u.value}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                {u.label}
              </span>
            </div>
            {i < units.length - 1 && <span className="text-lg text-muted-foreground/50">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
