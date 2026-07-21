"use client"

import { useMemo } from "react"

// Subtle glowing particles + elegant gradients. No coins, balls, or casino graphics.
export function SiteBackground() {
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        size: (i % 3) + 2,
        delay: `${(i % 7) * 0.8}s`,
        duration: `${6 + (i % 5)}s`,
        gold: i % 4 === 0,
      })),
    [],
  )

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* base vignette */}
      <div className="absolute inset-0 bg-background" />

      {/* gold glow top */}
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(248,200,74,0.16), transparent 70%)" }}
      />
      {/* blue glow left */}
      <div
        className="absolute top-1/3 -left-32 h-[460px] w-[460px] rounded-full blur-[130px]"
        style={{
          background: "radial-gradient(circle, rgba(46,107,255,0.18), transparent 70%)",
          animation: "ac-pulse-glow 9s ease-in-out infinite",
        }}
      />
      {/* blue glow bottom right */}
      <div
        className="absolute -bottom-40 -right-24 h-[500px] w-[500px] rounded-full blur-[140px]"
        style={{
          background: "radial-gradient(circle, rgba(46,107,255,0.12), transparent 70%)",
          animation: "ac-pulse-glow 11s ease-in-out infinite",
        }}
      />

      {/* fine grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(circle at 50% 30%, black, transparent 80%)",
        }}
      />

      {/* particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.gold ? "#f8c84a" : "#2e6bff",
            boxShadow: p.gold ? "0 0 8px 2px rgba(248,200,74,0.7)" : "0 0 8px 2px rgba(46,107,255,0.6)",
            animation: `ac-float ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </div>
  )
}
