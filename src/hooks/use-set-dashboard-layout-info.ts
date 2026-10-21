"use client";

import { useEffect, ReactNode } from "react";
import type { SectorInfo } from "@/lib/constants";
import { useDashboardLayoutStore } from "@/stores/use-dashboard-layout-store";

interface SetDashboardLayoutOptions {
  sectorInfo?: SectorInfo;
  headerActions?: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export function useSetDashboardLayoutInfo({
  sectorInfo,
  headerActions,
  eyebrow,
  title,
  subtitle
}: SetDashboardLayoutOptions) {
  const setSectorInfo = useDashboardLayoutStore((s) => s.setSectorInfo);
  const setHeaderActions = useDashboardLayoutStore((s) => s.setHeaderActions);
  const setHeaderTitle = useDashboardLayoutStore((s) => s.setHeaderTitle);
  const resetLayout = useDashboardLayoutStore((s) => s.resetLayout);

  useEffect(() => {
    if (sectorInfo !== undefined) setSectorInfo(sectorInfo);
    if (headerActions !== undefined) setHeaderActions(headerActions);

    setHeaderTitle({ eyebrow, title, subtitle });

    // Limpa automaticamente o estado ao desmontar a página
    return () => {
      resetLayout();
    };
  }, [sectorInfo, headerActions, eyebrow, title, subtitle, setSectorInfo, setHeaderActions, setHeaderTitle, resetLayout]);
}