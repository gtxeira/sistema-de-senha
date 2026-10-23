import type { Route } from 'next';

import Link from 'next/link';
import React from 'react';

import { cn } from '@/client/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';

export interface NavCardProps {
  readonly title: string;
  readonly description: string;
  readonly href: Route;
  readonly icon: React.ReactNode;
  readonly iconBgClass: string;
  readonly iconColorClass: string;
  readonly colSpanFull?: boolean;
}

export function NavCard({
  title,
  colSpanFull = false,
  description,
  href,
  icon,
  iconBgClass,
  iconColorClass,
}: NavCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-4',
        colSpanFull && 'col-span-full',
      )}
    >
      <Card className="w-full transition-[transform,box-shadow] duration-150 hover:-translate-y-0.75 hover:shadow-[0_8px_28px_rgba(0,0,0,0.1)] active:scale-[0.98]">
        <CardContent className="flex items-center gap-4 py-2">
          <div
            className={cn(
              'grid size-14 shrink-0 place-items-center rounded-[14px]',
              iconBgClass,
              iconColorClass,
            )}
          >
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="font-extrabold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="text-[18px] text-border transition-[transform,color] duration-150 group-hover:translate-x-1 group-hover:text-primary">
            →
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
