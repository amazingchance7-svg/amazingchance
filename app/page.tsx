import { ShieldCheck, ArrowRight } from "lucide-react"
import { SiteBackground } from "@/components/site-background"
import { SiteNav } from "@/components/site-nav"
import { LiveJackpot } from "@/components/live-jackpot"
import { Countdown } from "@/components/countdown"
import { TransparencyScore } from "@/components/transparency-score"
import { Winners } from "@/components/winners"

export default function Page() {
  return (
    <div className="relative min-h-screen">
      <SiteBackground />

      <div className="relative z-10">
        <SiteNav />

        <main className="mx-auto flex max-w-5xl flex-col items-center px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
          {/* Jackpot */}
          <LiveJackpot />

          {/* Countdown */}
          <div className="mt-8 sm:mt-10">
            <Countdown />
          </div>

          {/* CTAs */}
          <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center">
            <a
              href="#"
              className="group flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gold px-6 py-3.5 text-[15px] font-semibold text-gold-foreground shadow-[0_0_40px_-8px_rgba(248,200,74,0.6)] transition-all hover:shadow-[0_0_50px_-6px_rgba(248,200,74,0.8)]"
            >
              Join This Week&apos;s Jackpot
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#transparency"
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-card/60 px-6 py-3.5 text-[15px] font-semibold text-foreground backdrop-blur-sm transition-colors hover:border-blue/50 hover:text-blue"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify Everything
            </a>
          </div>

          {/* Transparency score */}
          <div className="mt-10 w-full max-w-3xl">
            <TransparencyScore />
          </div>

          {/* Winners */}
          <div className="mt-10 w-full max-w-3xl">
            <Winners />
          </div>
        </main>
      </div>
    </div>
  )
}
