import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Cartão de indicador (valor grande + rótulo).
 * Substitui `.statCard` + variantes `.statCardNormal`/`.statCardPref`.
 */
const statCardVariants = cva("rounded-[10px] border border-border bg-card px-5 py-[18px]", {
  variants: {
    tone: {
      default: "text-primary-hover",
      normal: "text-[#1972a0]",
      preferencial: "text-[#ef4444]/90",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

interface StatCardProps
  extends React.ComponentProps<"article">,
    VariantProps<typeof statCardVariants> {
  value: React.ReactNode;
  label: React.ReactNode;
}

function StatCard({ className, tone, value, label, ...props }: StatCardProps) {
  return (
    <article
      data-slot="stat-card"
      className={cn(statCardVariants({ tone }), className)}
      {...props}
    >
      <strong className="block text-[32px] font-black leading-none">{value}</strong>
      <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">
        {label}
      </span>
    </article>
  );
}

export { StatCard, statCardVariants };
