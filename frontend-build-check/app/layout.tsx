import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Toaster } from "react-hot-toast";
import PWAInstallPrompt from "@/components/pwa/PWAInstallPrompt";
import Providers from "@/providers";

export const metadata: Metadata = {
  title: "Automexia AI",
  description: "Automexia AI automation platform",
  applicationName: "Automexia AI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Automexia AI",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2a5b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="brand-body bg-background text-foreground min-h-screen font-sans antialiased">
        <Providers>
          <PWAInstallPrompt />

          <Script
            id="facebook-sdk"
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3600,
              style: {
                background: "rgba(255,255,255,0.94)",
                color: "#0f1d34",
                borderRadius: "18px",
                fontSize: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(217,225,236,0.92)",
                boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
                backdropFilter: "blur(16px)",
              },
              success: {
                style: {
                  background: "rgba(236,253,245,0.96)",
                  color: "#166534",
                  border: "1px solid rgba(110,231,183,0.9)",
                },
                iconTheme: {
                  primary: "#16a34a",
                  secondary: "#f0fdf4",
                },
              },
              error: {
                style: {
                  background: "rgba(254,242,242,0.96)",
                  color: "#991b1b",
                  border: "1px solid rgba(252,165,165,0.92)",
                },
                iconTheme: {
                  primary: "#dc2626",
                  secondary: "#fff",
                },
              },
            }}
          />

          {children}
        </Providers>
      </body>
    </html>
  );
}
