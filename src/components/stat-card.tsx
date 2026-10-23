import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import * as React from 'react';

/**
 * Cartão de indicador (valor grande + rótulo).
 * Substitui `.statCard` + variantes `.statCardNormal`/`.statCardPref`.
 */
const statCardVariants = cva(
  'rounded-[10px] border border-border bg-card px-5 py-[18px]',
  {
    defaultVariants: {
      tone: 'default',
    },
    variants: {
      tone: {
        default: 'text-primary-hover',
        normal: 'text-[#1972a0]',
        preferencial: 'text-[#ef4444]/90',
      },
    },
  },
);

interface StatCardProps
  extends
    React.ComponentProps<'article'>,
    VariantProps<typeof statCardVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
}

function StatCard({ className, label, tone, value, ...props }: StatCardProps) {
  return (
    <article
      data-slot="stat-card"
      className={cn(statCardVariants({ tone }), className)}
      {...props}
    >
      <strong className="block text-[32px] leading-none font-black">
        {value}
      </strong>
      <span className="mt-1.5 block text-[11px] font-bold tracking-[0.5px] text-muted-foreground uppercase">
        {label}
      </span>
    </article>
  );
}

export { StatCard, statCardVariants };
