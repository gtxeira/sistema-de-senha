"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Settings2, Headphones } from "lucide-react";
import { getSessionSnapshot, SECTORS } from "@/lib/queue";
import {
  SCREEN_ADMIN,
  canAccessSector,
  hasPermission,
} from "@/lib/permissions";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";

/* ── Cartão de navegação ──
   Valores exatos do Home.module.css antigo (bordas/ícones personalizados
   da identidade da tela) para a migração permanecer pixel-idêntica. */
const cardStyle =
  "group flex items-center gap-4 rounded-[14px] border border-[#dde9ed] bg-white px-5 py-6 text-[#0d2d47] shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-[3px] hover:border-[#b5d4e0] hover:shadow-[0_8px_28px_rgba(0,0,0,0.1)] active:scale-[0.98]";
const cardIconStyle =
  "grid size-14 shrink-0 place-items-center rounded-[14px]";
const cardTitleStyle =
  "mb-[3px] block text-base font-extrabold text-[#0d2d47]";
const cardDescStyle = "text-xs leading-normal text-[#7a9aad]";
const cardArrowStyle =
  "text-[18px] text-[#b5d4e0] transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-[#1678a0]";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getSessionSnapshot()) router.push("/login");
  }, [router]);

  const session = getSessionSnapshot();
  if (!session) return null;

  return (
    <SidebarLayout
      activeRoute="home"
      session={session}
      sectorInfo={null}
      eyebrow="BEM-VINDO"
      title="O que deseja fazer?"
      subtitle=""
      headerActions={null}
    >
        {/* ── Conteúdo ── */}
        <div className="mt-5 w-full flex-1">
          <div className="grid grid-cols-2 gap-4 max-[500px]:grid-cols-1">

            {/* Monitores — só os setores acessíveis à sessão */}
            {Object.values(SECTORS)
              .filter((s) => canAccessSector(session, s.id, "read"))
              .map((s) => (
              <Link key={s.id} href={`/monitor/${s.id}`} className={cardStyle}>
                <div className={`${cardIconStyle} bg-[#e6f4fb] text-[#1678a0]`}>
                  <Monitor size={30} />
                </div>
                <div className="flex-1">
                  <strong className={cardTitleStyle}>Monitor</strong>
                  <span className={cardDescStyle}>{s.name}</span>
                </div>
                <div className={cardArrowStyle}>→</div>
              </Link>
            ))}

            {/* Painel de Atendimento */}
            <Link href="/painel" className={`${cardStyle} col-span-full`}>
              <div className={`${cardIconStyle} bg-[#f5f3ff] text-[#7c3aed]`}>
                <Headphones size={30} />
              </div>
              <div className="flex-1">
                <strong className={cardTitleStyle}>Painel de Atendimento</strong>
                <span className={cardDescStyle}>Controle as chamadas em tempo real</span>
              </div>
              <div className={cardArrowStyle}>→</div>
            </Link>

            {/* Admin — só quem tem a permissão de tela */}
            {hasPermission(session, SCREEN_ADMIN) && (
              <Link href="/admin" className={`${cardStyle} col-span-full`}>
                <div className={`${cardIconStyle} bg-[#fff7ed] text-[#ea580c]`}>
                  <Settings2 size={30} />
                </div>
                <div className="flex-1">
                  <strong className={cardTitleStyle}>Administração</strong>
                  <span className={cardDescStyle}>Filas, notícias e estatísticas</span>
                </div>
                <div className={cardArrowStyle}>→</div>
              </Link>
            )}

          </div>
        </div>
    </SidebarLayout>
  );
}
