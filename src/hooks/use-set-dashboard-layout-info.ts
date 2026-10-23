"use client";

import { useEffect, ReactNode } from "react";
import type { SectorInfo } from "@/shared/constants";
import { useDashboardLayoutStore } from "@/stores/use-dashboard-layout-store";

interface SetDashboardLayoutOptions {
  sectorInfo?: SectorInfo;
  headerActions?: ReactNode;
}

/**
 * Publica na store de layout o que a página quer no "casco" do dashboard.
 *
 * Só o setor em foco e as ações do cabeçalho — o título da tela é
 * renderizado pela própria página (`<PageHeader>`).
 */
export function useSetDashboardLayoutInfo({
  sectorInfo,
  headerActions,
}: SetDashboardLayoutOptions) {
  const setSectorInfo = useDashboardLayoutStore((s) => s.setSectorInfo);
  const setHeaderActions = useDashboardLayoutStore((s) => s.setHeaderActions);
  const resetLayout = useDashboardLayoutStore((s) => s.resetLayout);

  useEffect(() => {
    if (sectorInfo !== undefined) setSectorInfo(sectorInfo);
    if (headerActions !== undefined) setHeaderActions(headerActions);
  }, [sectorInfo, headerActions, setSectorInfo, setHeaderActions]);

  // Limpa ao desmontar a página. Fica num effect separado do de
  // publicação: junto, o cleanup dispararia a cada render (o
  // `headerActions` é um JSX novo toda vez) e a store zeraria e republicaria
  // os próprios valores a cada render.
  useEffect(() => () => resetLayout(), [resetLayout]);
}
