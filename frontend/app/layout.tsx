import "./globals.css"
import { Toaster } from "react-hot-toast"
import { Roboto } from "next/font/google"
import Script from "next/script"
import ReactQueryProvider from "../providers" // ✅ ADD

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
  return (
    <html lang="en">
      <body
        className={`${roboto.className} bg-slate-100 text-gray-900 min-h-screen`}
        suppressHydrationWarning
      >

        {/* 🔥 REACT QUERY PROVIDER */}
        <ReactQueryProvider>
          
          {/* 🔥 FACEBOOK SDK */}
          <Script
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          {/* 🔥 TOASTER */}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: "10px",
                padding: "12px 16px",
                fontSize: "14px",
              },
            }}
          />

          {children}

        </ReactQueryProvider>

      </body>
    </html>
  )
}