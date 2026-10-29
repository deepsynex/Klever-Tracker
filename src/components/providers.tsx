"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ApiRequestError } from "@/lib/graphql/client";

function shouldRetry(failureCount: number, error: unknown) {
  // Don't retry errors a retry can't fix.
  if (error instanceof ApiRequestError) {
    const noRetry = ["unauthenticated", "forbidden", "not_found", "validation", "invalid_credentials"];
    if (noRetry.includes(error.error.kind)) return false;
  }
  return failureCount < 2;
}

export function Providers({ children, dir }: { children: ReactNode; dir: "ltr" | "rtl" }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  // Signed out: forget the previous user's data (and permissions) before anyone else signs in.
  const pathname = usePathname();
  const onAuthPage = /\/(login|forgot-password|reset-password)(\/|$)/.test(pathname ?? "");
  useEffect(() => {
    if (onAuthPage) queryClient.clear();
  }, [onAuthPage, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster dir={dir} position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors closeButton />
    </QueryClientProvider>
  );
}
