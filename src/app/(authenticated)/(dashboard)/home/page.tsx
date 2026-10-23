'use client';

import type { Route } from 'next';

import { Headphones, History, Monitor, Settings2 } from 'lucide-react';

import {
  NavCard,
  type NavCardProps,
} from '@/app/(authenticated)/(dashboard)/home/nav-card';
import { PageHeader } from '@/components/page-header';
import { useEffectiveSession } from '@/hooks/use-effective-session';
import { SECTORS } from '@/shared/constants';
import {
  canAccessSector,
  hasPermission,
  SCREEN_ADMIN,
} from '@/shared/permissions';

export default function HomePage() {
  const session = useEffectiveSession();
  if (!session) return null;

  const navItems: NavItem[] = [
    hasPermission(session, SCREEN_ADMIN) && {
      id: 'admin',
      href: '/admin' as Route,
      title: 'Administração',
      description: 'Filas, notícias e estatísticas',
      icon: <Settings2 size={30} />,
      iconBgClass: 'bg-[#fff7ed]',
      iconColorClass: 'text-[#ea580c]',
      colSpanFull: true,
    },
    {
      id: 'painel',
      href: '/painel' as Route,
      title: 'Painel de Atendimento',
      description: 'Controle as chamadas em tempo real',
      icon: <Headphones size={30} />,
      iconBgClass: 'bg-[#f5f3ff]',
      iconColorClass: 'text-[#7c3aed]',
      colSpanFull: true,
    },
    {
      id: 'historico',
      href: '/historico' as Route,
      title: 'Histórico',
      description: 'Consulte todas as chamadas de senhas realizadas',
      icon: <History size={30} />,
      iconBgClass: 'bg-[#f5f3ff]',
      iconColorClass: 'text-amber',
      colSpanFull: true,
    },
    ...Object.values(SECTORS)
      .filter((s) => canAccessSector(session, s.id, 'read'))
      .map((s) => ({
        id: `monitor-${s.id}`,
        href: `/monitor/${s.id}` as Route,
        title: 'Monitor',
        description: s.name,
        icon: <Monitor size={30} />,
        iconBgClass: 'bg-primary-light',
        iconColorClass: 'text-primary',
        colSpanFull: false,
      })),
  ].filter((item) => typeof item === 'object' && item !== null); // Remove os itens 'false' (ex: Admin sem permissão)

  return (
    <>
      <PageHeader eyebrow="BEM-VINDO" title="O que deseja fazer?" />

      <div className="w-full flex-1">
        <div className="grid grid-cols-2 gap-4 max-[500px]:grid-cols-1">
          {navItems.map((item) => (
            <NavCard key={item.id} {...item} />
          ))}
        </div>
      </div>
    </>
  );
}

type NavItem = NavCardProps & {
  id: string;
};
