import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DEFAULT_SECTOR, getSector } from '@/shared/constants';
import { PAGE_TITLES } from '@/shared/page-title';

export default function MonitorLayout({ children }: MonitorLayoutProps) {
  return <>{children}</>;
}

/**
 * Metadados da rota `/monitor/[sector]`.
 *
 * Aqui o título é **gerado** (`generateMetadata`) e não fixo: o segmento
 * é dinâmico e o nome do setor vem do param `[sector]`. Setor inválido
 * cai no setor padrão — como na página, que faz a mesma checagem.
 *
 * O `page.tsx` é um client component e a API de metadata só existe em
 * server components — por isso o título mora no layout do segmento, que
 * é servidor. O `template` do layout raiz completa com o nome do sistema.
 */
export async function generateMetadata({
  params,
}: MonitorLayoutProps): Promise<Metadata> {
  const { sector } = await params;
  const info = getSector(sector) ?? getSector(DEFAULT_SECTOR);

  return {
    title: `${PAGE_TITLES['/monitor/[sector]']} - ${info?.name ?? 'Monitor'}`,
  };
}

interface MonitorLayoutProps {
  readonly children: ReactNode;
  /** Segmento dinâmico `[sector]` — chega como Promise no App Router. */
  readonly params: Promise<{ readonly sector: string }>;
}
