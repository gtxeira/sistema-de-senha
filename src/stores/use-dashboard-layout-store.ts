import { create } from "zustand";
import { ReactNode } from "react";
import type { SectorInfo } from "@/lib/constants";

interface LayoutState {
  sectorInfo?: SectorInfo;
  headerActions: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;

  setSectorInfo: (info?: SectorInfo) => void;
  setHeaderActions: (actions?: ReactNode) => void;
  setHeaderTitle: (data: { eyebrow?: string; title?: string; subtitle?: string }) => void;
  resetLayout: () => void;
}

export const useDashboardLayoutStore = create<LayoutState>()((set) => ({
  sectorInfo: undefined,
  headerActions: undefined,
  eyebrow: undefined,
  title: undefined,
  subtitle: undefined,

  setSectorInfo: (sectorInfo) => set({ sectorInfo }),
  setHeaderActions: (headerActions) => set({ headerActions: headerActions ?? null }),

  setHeaderTitle: (data) =>
    set({
      eyebrow: data.eyebrow,
      title: data.title,
      subtitle: data.subtitle,
    }),

  resetLayout: () =>
    set({
      sectorInfo: undefined,
      headerActions: undefined,
      eyebrow: undefined,
      title: undefined,
      subtitle: undefined,
    }),
}));