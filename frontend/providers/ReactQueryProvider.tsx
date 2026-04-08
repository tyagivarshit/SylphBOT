"use client";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // 🔥 IMPORTANT (debug)
          staleTime: 1000 * 60,
          refetchOnWindowFocus: false,
        },
      },
    })
  );

  const showDevtools = process.env.NODE_ENV !== "production";

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {showDevtools ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
