"use client"

import { useState } from "react"
import { Menu, X, ShieldCheck } from "lucide-react"

const links = [
  { label: "Home", href: "#" },
  { label: "Transparency", href: "#transparency" },
  { label: "Weekly Jackpot", href: "#" },
  { label: "Annual Jackpot", href: "#" },
  { label: "Winners", href: "#winners" },
  { label: "How it Works", href: "#" },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-20">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/40">
            <ShieldCheck className="h-4.5 w-4.5 text-gold" strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Amazing<span className="text-gold"> Chance</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden items-center gap-2 lg:flex">
          <a
            href="#"
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </a>
          <a
            href="#"
            className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Join
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-border lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="mx-4 rounded-2xl border border-border bg-card/90 p-3 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href="#"
                className="rounded-lg px-4 py-2.5 text-center text-sm font-medium ring-1 ring-border"
              >
                Login
              </a>
              <a
                href="#"
                className="rounded-lg bg-foreground px-4 py-2.5 text-center text-sm font-semibold text-background"
              >
                Join
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
