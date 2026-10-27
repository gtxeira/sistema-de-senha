'use client';

import { type ReactNode, useEffect } from 'react';

import { startSessionRefresh } from '@/client/session/session-refresh';
import { Toaster } from '@/components/ui/toast';
import { readCachedSession, useSessionStore } from '@/stores/use-session-store';

export default function Providers({ children }: { children: ReactNode }) {
  // Access token de 15min + refresh de 12h: mantém a sessão viva com a aba
  // aberta e força /login quando a janela de refresh acabar.
  useEffect(() => startSessionRefresh(), []);

  // Semeia a store com o espelho local da sessão.
  //
  // Num efeito (e não na inicialização do módulo) para que o primeiro
  // render do client seja idêntico ao HTML do servidor — semear antes
  // causaria hydration mismatch em toda tela que lê a sessão. O refresh
  // (acima) reconcilia com o servidor logo em seguida.
  useEffect(() => {
    useSessionStore.setState({ user: readCachedSession() });
  }, []);

  return <Toaster>{children}</Toaster>;
}
