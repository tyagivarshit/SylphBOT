"use client";

import ReactQueryProvider from "./ReactQueryProvider";
import { AuthProvider } from "@/context/AuthContext";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ReactQueryProvider>
  );
}