"use client"

import { useEffect, useRef, useState } from "react"

const START = 8492341

export function LiveJackpot() {
  const [amount, setAmount] = useState(START)
  const ref = useRef(START)

  useEffect(() => {
    const id = setInterval(() => {
      // small realistic increments as tickets are purchased
      ref.current += Math.floor(Math.random() * 340) + 40
      setAmount(ref.current)
    }, 1800)
    return () => clearInterval(id)
  }, [])

  const formatted = amount.toLocaleString("en-US")

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Live Weekly Jackpot
        </span>
      </div>

      <div
        className="mt-5 flex items-start justify-center font-mono tabular-nums leading-none"
        aria-live="polite"
        aria-label={`Current jackpot ${formatted} US dollars`}
      >
        <span className="mt-1.5 text-3xl font-medium text-gold sm:mt-3 sm:text-5xl">$</span>
        <span
          className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-6xl font-semibold tracking-tight text-transparent sm:text-8xl lg:text-[9rem]"
          style={{ textShadow: "0 0 60px rgba(248,200,74,0.15)" }}
        >
          {formatted}
        </span>
      </div>
    </div>
  )
}
