import "./globals.css"
import { Toaster } from "react-hot-toast"
import { Roboto } from "next/font/google"
import Script from "next/script"
import Providers from "@/providers" // ✅ ONLY THIS

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400","500","700"],
  display: "swap"
})

export const metadata = {
  title: "Sylph",
  description: "AI Automation Platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  console.log("🌍 RootLayout LOADED")

  return (
    <html lang="en">
      <body
        className={`${roboto.className} bg-slate-100 text-gray-900 min-h-screen`}
        suppressHydrationWarning
      >

        <Providers>

          <Script
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          <Toaster position="top-right" />

          {children}

        </Providers>

      </body>
    </html>
  )
}