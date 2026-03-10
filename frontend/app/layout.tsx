import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Roboto } from "next/font/google";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400","500","700"],
  display: "swap"
});

export const metadata = {
  title: "Sylph AI",
  description: "AI Agents for Business Automation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${roboto.className} bg-slate-100 text-gray-900 h-screen`}>

        {/* 🔵 FACEBOOK SDK SCRIPT (WHATSAPP CONNECT) */}
        <script
          async
          defer
          crossOrigin="anonymous"
          src="https://connect.facebook.net/en_US/sdk.js"
        />

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

      </body>
    </html>
  );
}