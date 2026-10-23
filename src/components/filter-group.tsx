import * as React from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { cn } from 'cn';

/**
 * Campo de filtro com rótulo em caixa alta — padrão dos filtros de
 * Histórico/Admin (`.filterGroup`). O controle (select/input) vai em `children`.
 */
interface FilterGroupProps extends React.ComponentProps<typeof Field> {
  label: React.ReactNode;
  htmlFor?: string;
}

function FilterGroup({
  className,
  label,
  htmlFor,
  children,
  ...props
}: FilterGroupProps) {
  return (
    <Field
      data-slot="filter-group"
      className={cn('min-w-[120px] gap-[5px]', className)}
      {...props}
    >
      <FieldLabel
        htmlFor={htmlFor}
        className="text-[10px] font-extrabold tracking-[1px] text-muted-foreground uppercase"
      >
        {label}
      </FieldLabel>
      {children}
    </Field>
  );
}

export { FilterGroup };
