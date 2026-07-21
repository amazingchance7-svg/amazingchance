import { BadgeCheck } from "lucide-react"

const winners = [
  { ticket: "AC-7F42-9K1D", prize: "$4,120,500", country: "Singapore" },
  { ticket: "AC-3B88-2QX7", prize: "$2,980,000", country: "Germany" },
  { ticket: "AC-9C05-6MZ4", prize: "$1,391,841", country: "Canada" },
]

export function Winners() {
  return (
    <section id="winners" className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Last Sunday&apos;s Winners
        </h2>
        <a href="#" className="text-[13px] font-medium text-blue transition-colors hover:text-gold">
          View all
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {winners.map((w) => (
          <div
            key={w.ticket}
            className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-md transition-colors hover:border-gold/30"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {w.ticket}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                <BadgeCheck className="h-3 w-3" strokeWidth={2.5} />
                Verified
              </span>
            </div>
            <div className="mt-3 font-mono text-2xl font-semibold tabular-nums text-gold">
              {w.prize}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">{w.country}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
