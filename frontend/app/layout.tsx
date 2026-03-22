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
  title: "Sylph",
  description: "AI Automation Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  console.log("🌍 ROOT LAYOUT RENDER"); // 🔥 DEBUG

  return (
    <html lang="en">
      <body
        className={`${roboto.className} bg-slate-100 text-gray-900 min-h-screen`}
      >
        <Providers>

          <Script
            id="facebook-sdk"
            src="https://connect.facebook.net/en_US/sdk.js"
            strategy="afterInteractive"
          />

          <Toaster position="top-right" />

          {children}

        </Providers>
      </body>
    </html>
  );
}