"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Settings2, Headphones, History } from "lucide-react";
import { getSessionSnapshot, SECTORS } from "@/lib/queue";
import {
  SCREEN_ADMIN,
  canAccessSector,
  hasPermission,
} from "@/lib/permissions";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

/* ── Cartão de navegação ── */
const cardLinkStyle =
  "group flex items-center gap-4 transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-[0_8px_28px_rgba(0,0,0,0.1)] active:scale-[0.98]";
const cardIconStyle =
  "grid size-14 shrink-0 place-items-center rounded-[14px]";

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
              <Link key={s.id} href={`/monitor/${s.id}`} className={cardLinkStyle}>
                <Card className="w-full">
                  <CardContent className="flex items-center gap-4 py-2">
                    <div className={`${cardIconStyle} bg-primary-light text-primary`}>
                      <Monitor size={30} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="font-extrabold">Monitor</CardTitle>
                      <CardDescription>{s.name}</CardDescription>
                    </div>
                    <div className="text-[18px] text-border transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-primary">→</div>
                  </CardContent>
                </Card>
              </Link>
            ))}

            {/* Admin — só quem tem a permissão de tela */}
            {hasPermission(session, SCREEN_ADMIN) && (
              <Link href="/admin" className={`${cardLinkStyle} col-span-full`}>
                <Card className="w-full">
                  <CardContent className="flex items-center gap-4 py-2">
                    <div className={`${cardIconStyle} bg-[#fff7ed] text-[#ea580c]`}>
                      <Settings2 size={30} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="font-extrabold">Administração</CardTitle>
                      <CardDescription>Filas, notícias e estatísticas</CardDescription>
                    </div>
                    <div className="text-[18px] text-border transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-primary">→</div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* Painel de Atendimento */}
            <Link href="/painel" className={`${cardLinkStyle} col-span-full`}>
              <Card className="w-full">
                <CardContent className="flex items-center gap-4 py-2">
                  <div className={`${cardIconStyle} bg-[#f5f3ff] text-[#7c3aed]`}>
                    <Headphones size={30} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="font-extrabold">Painel de Atendimento</CardTitle>
                    <CardDescription>Controle as chamadas em tempo real</CardDescription>
                  </div>
                  <div className="text-[18px] text-border transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-primary">→</div>
                </CardContent>
              </Card>
            </Link>

            {/* Histórico */}
            <Link href="/painel" className={`${cardLinkStyle} col-span-full`}>
              <Card className="w-full">
                <CardContent className="flex items-center gap-4 py-2">
                  <div className={`${cardIconStyle} bg-[#f5f3ff] text-amber`}>
                    <History size={30} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="font-extrabold">Histórico</CardTitle>
                    <CardDescription>Consulte todas as chamadas de senhas realizadas</CardDescription>
                  </div>
                  <div className="text-[18px] text-border transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-primary">→</div>
                </CardContent>
              </Card>
            </Link>

          </div>
        </div>
    </SidebarLayout>
  );
}
