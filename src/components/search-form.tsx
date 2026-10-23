'use client';

import { SearchIcon } from 'lucide-react';

import { Label } from '@/components/ui/label';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from '@/components/ui/sidebar';

export function SearchForm({
  value,
  onValueChange,
  ...props
}: React.ComponentProps<'form'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <form {...props} onSubmit={(e) => e.preventDefault()}>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Label htmlFor="sidebar-search" className="sr-only">
            Buscar
          </Label>
          <SidebarInput
            id="sidebar-search"
            placeholder="Buscar..."
            className="border-transparent bg-sidebar-accent pl-8 text-sidebar-foreground shadow-none placeholder:text-sidebar-foreground/60 focus-visible:border-transparent"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-sidebar-foreground/60 select-none" />
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  );
}
