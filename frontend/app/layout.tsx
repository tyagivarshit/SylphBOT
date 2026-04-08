import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Roboto } from "next/font/google";
import Script from "next/script";
import Providers from "@/providers";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata = {
  title: "Automexia AI",
  description: "Automexia AI automation platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.log("🌍 ROOT LAYOUT RENDER");

  return (
    <html lang="en">
      <body
        className={`${roboto.className} bg-slate-100 text-gray-900 min-h-screen`}
      >
        <Providers>

          {/* 🔥 FACEBOOK SDK */}
          <Script
            id="facebook-sdk"
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          {/* 🔥 PREMIUM TOASTER */}
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
