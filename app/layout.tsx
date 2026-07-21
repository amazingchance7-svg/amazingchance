import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "Amazing Chance — The World's Most Transparent Digital Jackpot",
  description:
    "Amazing Chance is a premium, fully transparent global digital jackpot platform. Every ticket is public, every draw is Random.org verified, and the draw time is fixed.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#05070d",
  colorScheme: "dark",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`bg-background ${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
