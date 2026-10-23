'use client';

import { ChevronsUpDown, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import * as React from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSessionStore } from '@/stores/use-session-store';

export function NavUser({
  user,
}: {
  user: {
    name: string;
    sector: string;
  };
}) {
  const { isMobile } = useSidebar();

  const userInitials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'US';

  async function handleLogout(e: React.SyntheticEvent) {
    e.preventDefault();

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // segue o signOut mesmo sem a revogação (rede)
    }

    // Limpa a sessão local (store + espelho no storage) antes de sair: a
    // aba não pode continuar exibindo os dados do usuário que saiu.
    useSessionStore.getState().clear();
    void signOut({ callbackUrl: '/login' });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <UserAvatar user={user} userInitials={userInitials} />

                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            }
          />

          <DropdownMenuContent
            className="w-56 min-w-56 rounded-lg p-2"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserAvatar user={user} userInitials={userInitials} />
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={(e) => { void handleLogout(e); }}>
              <LogOut className="mr-2 size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserAvatar({
  user,
  userInitials,
}: {
  userInitials: string;
  user: {
    name: string;
    sector: string;
  };
}) {
  return (
    <>
      <Avatar className="size-8">
        <AvatarFallback className="text-[11px] font-bold">
          {userInitials}
        </AvatarFallback>
      </Avatar>

      <div className="grid flex-1 text-left text-sm/tight">
        <span className="truncate text-xs font-semibold">{user.name}</span>
        <span className="truncate text-[11px]">{user.sector}</span>
      </div>
    </>
  );
}
