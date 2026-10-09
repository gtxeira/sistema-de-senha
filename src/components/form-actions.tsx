import * as React from "react";
import { cn } from "cn";

/**
 * Linha de ações de formulário (primário + cancelar) — padrão do Admin
 * (`.formActions`).
 */
function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="form-actions" className={cn("flex gap-2.5", className)} {...props} />
  );
}

export { FormActions };
