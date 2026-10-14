"use client";

import { useEffect, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { startSessionRefresh } from "@/lib/session-refresh";

export default function Providers({ children }: { children: ReactNode }) {
  // Access token de 15min + refresh de 12h: mantém a sessão viva com a aba
  // aberta e força /login quando a janela de refresh acabar.
  useEffect(() => startSessionRefresh(), []);

  return (
    <SessionProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </SessionProvider>
  );
}
