import type { CallType, SequenceType } from '@/shared/constants';
import type { Permission, PermissionOverride } from '@/shared/permissions';
import type {
  CreateRoleInput,
  CreateUserInput,
  NewsItem,
  QueueStats,
  RecentCall,
  RoleRecord,
  UpdateRoleInput,
  UpdateUserInput,
  UserRecord,
} from '@/shared/types/domain';

/**
 * Contrato das camadas de dados.
 *
 * As classes concretas (`*-repo.postgres.ts`) declaram `implements` destas
 * interfaces, e `index.ts` expõe os repositórios tipados por elas — é isso que
 * permite trocar a implementação (as em-memória usadas nos testes de contrato
 * rodam sem que o restante da aplicação perceba a troca).
 *
 * Os records que atravessam a fronteira HTTP/UI vivem em
 * `@/shared/types/domain` e são reexportados aqui para que os repositórios
 * mantenham um import só (`./types`). O que é interno de persistência —
 * `QueueCallInput`, `CreateNewsInput`, interfaces de repositório — fica neste
 * módulo, que é interno do servidor.
 *
 * Nota sobre `sector: string`: o domínio tem dois setores, mas as rotas já
 * validam na borda com `Object.hasOwn(SECTORS, …)` e o TypeScript **não**
 * estreita com esse predicado. Escrever `SectorId` aqui empurraria casts para
 * toda rota; a validação fica no limite HTTP, e `isSectorId()`/`getSector()`
 * de `@/shared/constants` existem para a UI indexar `SECTORS` com segurança.
 */

export type {
  QueueCallRecord,
  RecentCall,
  HistoryCall,
  QueueStats,
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
  RoleRecord,
  CreateRoleInput,
  UpdateRoleInput,
  NewsItem,
} from '@/shared/types/domain';

/* ── Queue ──────────────────────────────────────────────────────── */

/** Payload aceito por `QueueRepository.saveCall`. */
export interface QueueCallInput {
  readonly sector: string;
  readonly number: number;
  readonly numberStr: string;
  readonly sequenceType: SequenceType;
  readonly callType: CallType;
  readonly attendantId: string | null;
}

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
  setNextNumber(
    sector: string,
    type: SequenceType,
    nextNumber: number,
  ): Promise<void>;

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
  /**
   * Filtra o histórico exibido (`calls` + `pagination.total`).
   *
   * Não afeta `summary`: os cards são totais da janela inteira, e um
   * filtro na tabela ("só preferenciais") não deve mudar "Total no
   * período" nem "Atendimentos hoje".
   */
  readonly type?: SequenceType | null;
  /** Inclusivo — primeira chamada dentro da janela. */
  readonly since?: Date;
  /**
   * EXCLUSIVO — o instante da meia-noite BRT do dia seguinte.
   *
   * A janela padrão (quando `since`/`until` não vêm) é calculada por
   * `dayWindow()` em `@/shared/time`: dia-calendário BRT, não "agora
   * menos N×24h".
   */
  readonly until?: Date | null;
  /**
   * Página do histórico, 1-based.
   *
   * A paginação é feita no servidor: o cliente nunca recebe a janela
   * inteira. O servidor clampa em `[1, totalPages]`.
   */
  readonly page?: number;
  /** Linhas por página (default 20; máximo `MAX_PAGE_SIZE`). */
  readonly pageSize?: number;
  readonly days?: number;
  /**
   * O "agora" da consulta (padrão: `new Date()`).
   *
   * Existe para a janela ser determinística nos testes — sem ele, um
   * teste que roda perto da meia-noite BRT muda de resultado sozinho.
   */
  readonly now?: Date;
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
 * `src/server/auth/config.ts` (NextAuth), para não existir um segundo caminho
 * sem rate limit que valide senha.
 */
export interface AuthRepository {
  /** Resolve o username de login em e-mail. @throws 404 se não existir. */
  resolveLoginEmail(username: string): Promise<string>;
}

/* ── Users ──────────────────────────────────────────────────────── */

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

/**
 * Cargos e atribuições de permissão. As chaves de permissão em si vivem em
 * `src/shared/permissions.ts` — aqui só se grava cargo→permissão. Cargos
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
