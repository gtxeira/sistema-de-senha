import type { ReactNode } from 'react';
import type { SectorInfo } from '@/shared/constants';

import { create } from 'zustand';

/**
 * Estado do "casco" do dashboard que as páginas publicam.
 *
 * Só o que a página **não** consegue renderizar por conta própria: o
 * setor em foco (que aparece no rodapé da sidebar) e as ações do
 * cabeçalho.
 *
 * O título da tela (eyebrow/título/subtítulo) não mora aqui — cada
 * página renderiza o seu, via `<PageHeader>`. Guardar um `ReactNode`
 * numa store global é o que obrigava o layout inteiro a ser client
 * component.
 */
interface LayoutState {
  headerActions: ReactNode;
  sectorInfo?: SectorInfo;

  resetLayout: () => void;
  setHeaderActions: (actions?: ReactNode) => void;
  setSectorInfo: (info?: SectorInfo) => void;
}

export const useDashboardLayoutStore = create<LayoutState>()((set) => ({
  headerActions: undefined,
  sectorInfo: undefined,

  setHeaderActions: (headerActions) =>
    set({ headerActions: headerActions ?? null }),
  setSectorInfo: (sectorInfo) => set({ sectorInfo }),

  resetLayout: () =>
    set({
      headerActions: undefined,
      sectorInfo: undefined,
    }),
}));
