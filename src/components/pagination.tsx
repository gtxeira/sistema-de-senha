import { cn } from 'cn';
import * as React from 'react';

import { Button } from '@/components/ui/button';

/**
 * Navegação "← Anterior · Página X de Y · Próxima →" — padrão de
 * Histórico/Painel (`.pagination` + `.pageBtn`).
 */
interface PaginationProps extends React.ComponentProps<'nav'> {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  className,
  onPageChange,
  page,
  totalPages,
  ...props
}: PaginationProps) {
  return (
    <nav
      data-slot="pagination"
      aria-label="Paginação"
      className={cn(
        'mt-[18px] flex items-center justify-center gap-4 border-t border-border pt-4',
        className,
      )}
      {...props}
    >
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ← Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Próxima →
      </Button>
    </nav>
  );
}

export { Pagination };
