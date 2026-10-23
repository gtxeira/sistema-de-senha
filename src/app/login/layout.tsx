import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAGE_TITLES } from "@/shared/page-title";

/**
 * Metadados da rota `/login`.
 *
 * O `page.tsx` é um client component (o formulário usa `useState` e
 * `useRouter`) e a API de metadata só existe em server components — por
 * isso o título mora no layout do segmento, que é servidor. O
 * `template` do layout raiz completa com o nome do sistema.
 */
export const metadata: Metadata = {
  title: PAGE_TITLES["/login"],
};

export default function LoginLayout({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
