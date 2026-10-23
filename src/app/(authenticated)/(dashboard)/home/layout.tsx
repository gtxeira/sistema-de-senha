import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAGE_TITLES } from "@/shared/page-title";

/**
 * Metadados da rota `/home`.
 *
 * O `page.tsx` é um client component (os cards dependem da sessão
 * efetiva) e a API de metadata só existe em server components — por isso
 * o título mora no layout do segmento, que é servidor. O `template` do
 * layout raiz completa com o nome do sistema.
 */
export const metadata: Metadata = {
  title: PAGE_TITLES["/home"],
};

export default function HomeLayout({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
