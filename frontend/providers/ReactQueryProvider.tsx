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

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {

          queries: {
            staleTime: 1000 * 60, // 1 min
            gcTime: 1000 * 60 * 5, // 5 min

            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: false,

            retry: 1,

            // 🔥 prevent infinite retry loops on auth
            retryDelay: 1000,
          },

          mutations: {
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}

      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}