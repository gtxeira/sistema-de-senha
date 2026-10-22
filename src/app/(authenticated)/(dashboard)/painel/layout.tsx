import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAGE_TITLES } from "@/lib/page-title";

/**
 * Metadados da rota `/painel`.
 *
 * O `page.tsx` é um client component (a tela depende de hooks de fila e
 * de sessão) e a API de metadata só existe em server components — por
 * isso o título mora no layout do segmento, que é servidor. O `template`
 * do layout raiz completa com o nome do sistema.
 */
export const metadata: Metadata = {
  title: PAGE_TITLES["/painel"],
};

export default function PainelLayout({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
