import type { PermissionOverride } from "@/shared/permissions";
import type { SequenceType } from "@/shared/constants";

/**
 * Tipos de domínio compartilhados entre a API e a UI.
 *
 * Aqui ficam apenas os formatos que atravessam a fronteira (records e
 * payloads de entrada/saída da API). Contratos internos de persistência —
 * interfaces de repositório e inputs que carregam `File`, por exemplo — ficam
 * em `@/server/repositories/types`.
 */

/* ── Registros de fila ──────────────────────────────────────────── */

/**
 * Linha de chamada normalizada, no formato que a UI consome.
 *
 * `createdAt` é o INSTANTE da chamada em ISO-8601 (UTC) — e não um
 * "HH:mm" já formatado. A regra do sistema é uma só: o wire carrega
 * instantes, e quem formata (em BRT) é o cliente, via `@/shared/time`.
 */
export interface QueueCallRecord {
  readonly id: string;
  readonly number: number;
  readonly type: SequenceType;
  /** Instante da chamada em ISO-8601 (UTC). */
  readonly createdAt: string;
}

/** Saída de `QueueRepository.getRecentCalls`. */
export type RecentCall = QueueCallRecord;

/** Saída de `ReadRepository.getStats` — carrega o setor de origem. */
export interface HistoryCall extends QueueCallRecord {
  readonly sector_id: string;
}

/** Estatísticas de uma janela, com paginação — formato consumido pela UI. */
export interface QueueStats {
  readonly days: number;
  /**
   * Resumo da janela inteira — ignora `type` e `page`.
   *
   * `total` pode ser MAIOR que `pagination.total` quando há filtro de
   * tipo: os cards resumem o período, a tabela mostra só o filtro.
   */
  readonly summary: {
    readonly total: number;
    readonly today: number;
    readonly preferencial: number;
    readonly normal: number;
  };
  /** Apenas a página pedida — nunca a janela inteira. */
  readonly calls: readonly HistoryCall[];
  readonly pagination: {
    /** Página efetivamente devolvida (o servidor clampa em `totalPages`). */
    readonly page: number;
    readonly pageSize: number;
    /** Linhas que casam janela + sector + type (o filtro da tabela). */
    readonly total: number;
    /** `max(1, ceil(total / pageSize))` — nunca zero, para a UI. */
    readonly totalPages: number;
  };
  /** Só no fallback: a query falhou e a resposta é a estrutura vazia. */
  readonly noDb?: boolean;
}

/* ── Usuários ──────────────────────────────────────────────────── */

/**
 * Usuário achatado (cargo/overrides desaninhados) — o formato consumido pela
 * UI de listagem e pelos testes de contrato.
 *
 * `role` é a CHAVE do cargo ("admin"|"attendant"|chave custom), não o id.
 */
export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly full_name: string;
  readonly active: boolean;
  readonly sector_id: string | null;
  /** `"none"` no banco — coluna string, não numérica. */
  readonly guiche_id: string;
  readonly role_id: string;
  readonly role: string | null;
  readonly role_name: string | null;
  readonly role_built_in: boolean;
  readonly permissions: readonly PermissionOverride[];
}

export interface CreateUserInput {
  readonly username: string;
  readonly password: string;
  readonly full_name: string;
  readonly role_id?: string;
  readonly role?: string;
  readonly sector_id?: string | null;
  readonly active?: boolean;
  readonly permissions?: readonly PermissionOverride[];
}

/** `password` em branco mantém a senha atual. */
export interface UpdateUserInput {
  readonly full_name?: string;
  readonly password?: string;
  readonly role_id?: string;
  readonly role?: string;
  readonly sector_id?: string | null;
  readonly active?: boolean;
}

/* ── Cargos ────────────────────────────────────────────────────── */

export interface RoleRecord {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly built_in: boolean;
  readonly permissions: readonly string[];
}

export interface CreateRoleInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly permissions?: readonly string[];
}

export interface UpdateRoleInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly permissions?: readonly string[];
}

/* ── Notícias ──────────────────────────────────────────────────── */

export interface NewsItem {
  readonly id: string;
  readonly title: string;
  readonly image: string;
}
