import * as React from "react";
import { cn } from "cn";

/**
 * Bloco de conteúdo com fundo branco, borda e respiro interno.
 * Padrão repetido em Admin/Histórico (`.section`).
 */
function Section({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="section"
      className={cn(
        "mt-[25px] rounded-[12px] border border-border bg-card p-[26px]",
        className,
      )}
      {...props}
    />
  );
}

export { Section };
