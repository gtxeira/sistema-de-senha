import { describe, expect, it } from 'vitest';

import {
  ALL_SECTORS,
  ALL_SECTORS_INFO,
  getSector,
  getSectorScope,
  isSectorId,
  isSectorScope,
  SECTORS,
} from '@/shared/constants';

describe('escopo de setor', () => {
  it('resolve setores reais', () => {
    expect(getSectorScope('farmacia')).toEqual(SECTORS.farmacia);
    expect(getSectorScope('recepcao')).toEqual(SECTORS.recepcao);
  });

  it("resolve 'Todos' como o pseudo-setor agregado", () => {
    expect(getSectorScope(ALL_SECTORS)).toBe(ALL_SECTORS_INFO);
    expect(ALL_SECTORS_INFO.id).toBe(ALL_SECTORS);
    expect(ALL_SECTORS_INFO.name).toBe('Todos os Setores');
  });

  it('devolve undefined para valor inválido', () => {
    expect(getSectorScope('nao-existe')).toBeUndefined();
    // "null" foi o valor mágico usado antes para "Todos" — não é um setor.
    expect(getSectorScope('null')).toBeUndefined();
  });

  it("isSectorScope aceita setor real e 'Todos'", () => {
    expect(isSectorScope('farmacia')).toBe(true);
    expect(isSectorScope(ALL_SECTORS)).toBe(true);
    expect(isSectorScope('null')).toBe(false);
    expect(isSectorScope(null)).toBe(false);
    expect(isSectorScope()).toBe(false);
  });

  it("isSectorId não aceita o pseudo-setor 'Todos'", () => {
    expect(isSectorId(ALL_SECTORS)).toBe(false);
    expect(isSectorId('farmacia')).toBe(true);
    expect(getSector(ALL_SECTORS)).toBeUndefined();
  });
});
