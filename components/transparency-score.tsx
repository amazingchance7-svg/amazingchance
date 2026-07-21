import { CheckCircle2, FileClock, ShieldCheck, Timer, ArrowRight } from "lucide-react"

const points = [
  { icon: CheckCircle2, label: "Every Ticket Public" },
  { icon: ShieldCheck, label: "Random.org Verified" },
  { icon: Timer, label: "Fixed Draw Time" },
]

export function TransparencyScore() {
  return (
    <div
      id="transparency"
      className="w-full rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-md sm:p-5"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="font-mono text-4xl font-semibold tabular-nums text-success sm:text-5xl">
              100%
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Transparency
            </span>
          </div>
          <div className="h-12 w-px bg-border" />
          <ul className="flex flex-col gap-1.5">
            {points.map((p) => (
              <li key={p.label} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <p.icon className="h-4 w-4 text-gold" strokeWidth={2} />
                <span className="text-foreground/90">{p.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <a
          href="#"
          className="group flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-4 py-2.5 text-[13px] font-medium transition-colors hover:border-gold/40 hover:text-gold"
        >
          <FileClock className="h-4 w-4" />
          Open Draw History
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </div>
  )
}
