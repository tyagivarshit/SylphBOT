import "./globals.css";
import Script from "next/script";
import { Toaster } from "react-hot-toast";
import Providers from "@/providers";

export const metadata = {
  title: "Automexia AI",
  description: "Automexia AI automation platform",
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
          <Script
            id="facebook-sdk"
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
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
                iconTheme: {
                  primary: "#1E5EFF",
                  secondary: "#fff",
                },
              },
              error: {
                iconTheme: {
                  primary: "#ef4444",
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
