"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_SECTORS,
  ALL_SECTORS_INFO,
  SECTORS,
} from "@/shared/constants";
import type { SectorScope } from "@/shared/constants";

export interface SectorSelectProps {
  /** Escopo selecionado: um setor real ou "Todos". */
  readonly value: SectorScope;
  readonly onValueChange: (value: SectorScope) => void;
  /**
   * Exibe a opção "Todos" (visão agregada de todos os setores).
   * Só faz sentido em telas que agregam setores — o histórico.
   */
  readonly allowAll?: boolean;
}

/**
 * Seletor de setor compartilhado entre o painel e o histórico.
 *
 * O painel opera uma fila por vez (só setores reais); o histórico também
 * aceita a visão agregada "Todos" (`ALL_SECTORS`), que a API trata como
 * consulta sem filtro de setor.
 */
export function SectorSelect({
  value,
  onValueChange,
  allowAll = false,
}: SectorSelectProps) {
  const sectors = Object.values(SECTORS);

  // `items` faz o `Select.Value` mostrar o rótulo do item selecionado — o
  // popup do select não fica montado enquanto ele está fechado.
  const items = {
    ...(allowAll ? { [ALL_SECTORS]: ALL_SECTORS_INFO.name } : {}),
    ...Object.fromEntries(sectors.map((s) => [s.id, s.name])),
  };

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === null) return;
        onValueChange(v);
      }}
      items={items}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Setores</SelectLabel>

          {allowAll && (
            <SelectItem value={ALL_SECTORS}>{ALL_SECTORS_INFO.name}</SelectItem>
          )}

          {sectors.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
