import type { CallType, SequenceType } from "@/lib/constants";
import type { Permission, PermissionOverride } from "@/lib/permissions";

/**
 * Contrato das camadas de dados.
 *
 * As classes concretas (`*-repo.postgres.ts`) declaram `implements` destas
 * interfaces, e `index.ts` expõe os repositórios tipados por elas — é isso que
 * permite trocar Postgres por implementação em memória (testes de contrato)
 * sem que o resto da aplicação perceba.
 *
 * Nota sobre `sector: string`: o domínio tem dois setores, mas as rotas já
 * validam na borda com `Object.hasOwn(SECTORS, …)` e o TypeScript **não**
 * estreita com esse predicado. Escrever `SectorId` aqui empurraria casts para
 * toda rota; a validação fica no limite HTTP, e `isSectorId()`/`getSector()`
 * de `@/lib/constants` existem para a UI indexar `SECTORS` com segurança.
 */

/* ── Registros de fila ──────────────────────────────────────────── */

/**
 * Linha de chamada normalizada, no formato que a UI consome.
 *
 * `createdAt` é o INSTANTE da chamada em ISO-8601 (UTC) — e não um
 * "HH:mm" já formatado. A regra do sistema é uma só: o wire carrega
 * instantes, e quem formata (em BRT) é o cliente, via `@/lib/time`.
 *
 * A diferença não é estética: um "HH:mm" não diz de que dia a chamada
 * foi, e é justamente o dia que decide se ela entra em "Hoje".
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

/** Payload aceito por `QueueRepository.saveCall`. */
export interface QueueCallInput {
  readonly sector: string;
  readonly number: number;
  readonly numberStr: string;
  readonly sequenceType: SequenceType;
  readonly callType: CallType;
  readonly attendantId: string | null;
}

/* ── Queue ──────────────────────────────────────────────────────── */

export interface QueueRepository {
  /**
   * Próximo número do setor/tipo, com transação atômica e wraparound em
   * `MAX_QUEUE_NUMBER` (999 → 000).
   */
  nextNumber(
    sector: string,
    type: SequenceType,
  ): Promise<{ number: number; wraparound: boolean }>;

  /**
   * Persiste uma chamada e devolve o id gerado + o instante gravado.
   *
   * O instante vem do banco (`created_at`), não de `new Date()`: é o
   * valor que virou registro, e é ele que o SSE propaga adiante.
   */
  saveCall(call: QueueCallInput): Promise<{ id: string; createdAt: string }>;

  /** Marcador de reset do setor (`null` quando nunca foi resetado). */
  getSectorResetAt(sector: string): Promise<Date | null>;

  /**
   * Zera a sequência do setor. As linhas de `queue_calls` são mantidas de
   * propósito — `/historico` as lê.
   */
  resetSector(sector: string): Promise<void>;

  /** Fixa o próximo número (sync manual). A chamada seguinte retorna `nextNumber`. */
  setNextNumber(sector: string, type: SequenceType, nextNumber: number): Promise<void>;

  /**
   * Chamadas recentes do setor. Com `resetAt`, exclui as anteriores ao reset
   * (que sobrevivem ao reset e não devem ser repetidas num monitor).
   */
  getRecentCalls(
    sector: string,
    limit?: number,
    resetAt?: Date | null,
  ): Promise<RecentCall[]>;
}

/* ── Read (agregações) ──────────────────────────────────────────── */

export interface StatsOptions {
  readonly sector?: string | null;
  /** Inclusivo — primeira chamada dentro da janela. */
  readonly since?: Date;
  /**
   * EXCLUSIVO — o instante da meia-noite BRT do dia seguinte.
   *
   * A janela padrão (quando `since`/`until` não vêm) é calculada por
   * `dayWindow()` em `@/lib/time`: dia-calendário BRT, não "agora
   * menos N×24h".
   */
  readonly until?: Date | null;
  readonly limit?: number;
  readonly days?: number;
  /**
   * O "agora" da consulta (padrão: `new Date()`).
   *
   * Existe para a janela ser determinística nos testes — sem ele, um
   * teste que roda perto da meia-noite BRT muda de resultado sozinho.
   */
  readonly now?: Date;
}

export interface QueueStats {
  readonly days: number;
  readonly summary: {
    readonly total: number;
    readonly today: number;
    readonly preferencial: number;
    readonly normal: number;
  };
  readonly bySector: ReadonlyArray<{ readonly sector: string; readonly total: number }>;
  readonly byType: ReadonlyArray<{ readonly type: string; readonly total: number }>;
  readonly recent: readonly HistoryCall[];
  readonly recentBySector: Readonly<Record<string, readonly HistoryCall[]>>;
  /** Só no fallback: a query falhou e a resposta é a estrutura vazia. */
  readonly noDb?: boolean;
}

export interface ReadRepository {
  /**
   * Estatísticas de uma janela, com filtros por setor/tipo. Nunca lança:
   * em erro devolve a estrutura vazia com `noDb: true`.
   */
  getStats(options?: StatsOptions): Promise<QueueStats>;
}

/* ── Auth ───────────────────────────────────────────────────────── */

/**
 * Verificação de credencial **não** faz parte deste contrato — ela vive em
 * `src/auth.ts` (NextAuth), para não existir um segundo caminho sem rate
 * limit que valide senha.
 */
export interface AuthRepository {
  /** Resolve o username de login em e-mail. @throws 404 se não existir. */
  resolveLoginEmail(username: string): Promise<string>;
}

/* ── Users ──────────────────────────────────────────────────────── */

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

export interface UsersRepository {
  /** Lista todos os usuários, com cargo e overrides. */
  list(): Promise<UserRecord[]>;

  create(data: CreateUserInput): Promise<{ success: true; user: UserRecord }>;

  update(id: string, data: UpdateUserInput): Promise<UserRecord>;

  /** Substitui todos os overrides (grants/denials) do usuário. */
  setPermissions(
    id: string,
    permissions: readonly PermissionOverride[],
  ): Promise<PermissionOverride[]>;

  /** Permissões efetivas (cargo ∪ grants − denials) para login/refresh. */
  getEffectivePermissions(id: string): Promise<Permission[] | null>;

  /** Remove o usuário — overrides e refresh tokens caem em cascata. */
  remove(id: string): Promise<void>;
}

/* ── Roles ──────────────────────────────────────────────────────── */

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

/**
 * Cargos e atribuições de permissão. As chaves de permissão em si vivem em
 * `src/lib/permissions.ts` — aqui só se grava cargo→permissão. Cargos
 * built-in (admin/attendant) são imutáveis: sem eles o sistema se trancaria.
 */
export interface RolesRepository {
  list(): Promise<RoleRecord[]>;

  getByKey(key: string): Promise<RoleRecord | null>;

  create(data: CreateRoleInput): Promise<RoleRecord>;

  update(id: string, data: UpdateRoleInput): Promise<RoleRecord>;

  /** @throws 409 quando o cargo ainda tem usuários (FK RESTRICT). */
  remove(id: string): Promise<void>;
}

/* ── News ───────────────────────────────────────────────────────── */

export interface NewsItem {
  readonly id: string;
  readonly title: string;
  readonly image: string;
}

export interface CreateNewsInput {
  readonly title: string;
  /**
   * Vem de `FormData.get("image")`: pode chegar como string ou ausente quando
   * o envio é inválido. O repositório valida e lança 400 — depois das checagens
   * o tipo estreita para `File`.
   */
  readonly image: File | string | null;
}

export interface NewsRepository {
  /** Faz upload da imagem no S3 e grava a notícia (rollback do S3 se o banco falhar). */
  create(data: CreateNewsInput): Promise<{ success: true; news: NewsItem }>;

  /** Soft delete + remoção da imagem no S3. */
  remove(id: string | number): Promise<{ success: true }>;

  /** Notícias ativas, mais recentes primeiro. Nunca lança. */
  listActive(): Promise<NewsItem[]>;
}
