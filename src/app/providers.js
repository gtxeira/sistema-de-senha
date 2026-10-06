"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { startSessionRefresh } from "@/lib/session-refresh";

export default function Providers({ children }) {
  // Access token de 15min + refresh de 12h: mantém a sessão viva com a aba
  // aberta e força /login quando a janela de refresh acabar.
  useEffect(() => startSessionRefresh(), []);

  return <SessionProvider>{children}</SessionProvider>;
}
