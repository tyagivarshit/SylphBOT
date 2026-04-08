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
      <body className="bg-slate-100 text-gray-900 min-h-screen font-sans antialiased">
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
                background: "#111827",
                color: "#fff",
                borderRadius: "10px",
                fontSize: "14px",
                padding: "10px 14px",
              },
              success: {
                iconTheme: {
                  primary: "#14E1C1",
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
