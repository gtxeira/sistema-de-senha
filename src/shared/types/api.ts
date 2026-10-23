import type { User } from "next-auth";
import type { SequenceType } from "@/shared/constants";
import type { Permission, PermissionOverride } from "@/shared/permissions";
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
} from "@/shared/types/domain";

/**
 * Contrato HTTP entre as rotas em `src/app/api/*` e quem as chama.
 *
 * Como `readJson<T>`/`parseJson<T>` de `@/shared/json` assumem o formato do
 * corpo, estes tipos são a declaração *manual* desse formato — a única fonte
 * que existe, já que ele é definido em tempo de execução.
 *
 * Convenção aplicada a todos os corpos: o formato de sucesso tem os campos
 * obrigatórios e herda `error`/`code` de `ApiErrorBody`. Os campos de sucesso
 * serem obrigatórios não é ingenuidade — é o que os clientes realmente usam:
 * todo `readJson` aqui é lido depois de `if (!res.ok) throw`, então quem
 * garante a forma é o **status HTTP**, e `error` documenta só o caminho de
 * falha.
 */

/* ── Base ──────────────────────────────────────────────────────── */

/** Corpo de erro que qualquer rota pode devolver (4xx/5xx). */
export interface ApiErrorBody {
  readonly error?: string;
  readonly code?: string;
}

/* ── Sessão ────────────────────────────────────────────────────── */

/** `GET /api/auth/session` (Auth.js) — `{}` quando não há sessão. */
export interface AuthSessionBody extends ApiErrorBody {
  readonly user?: User;
}

/** `POST /api/auth/refresh`. */
export interface RefreshBody extends ApiErrorBody {
  readonly ok?: true;
  readonly permissions?: Permission[];
}

/* ── Usuários e cargos ─────────────────────────────────────────── */

/** `GET /api/users`. */
export interface UsersListBody extends ApiErrorBody {
  readonly users: UserRecord[];
}

/** `POST /api/users` e `PATCH /api/users`. */
export interface UserSaveBody extends ApiErrorBody {
  readonly success: true;
  readonly user: UserRecord;
}

/** `GET /api/roles`. */
export interface RolesListBody extends ApiErrorBody {
  readonly roles: RoleRecord[];
}

/** `POST /api/roles` e `PATCH /api/roles`. */
export interface RoleSaveBody extends ApiErrorBody {
  readonly success: true;
  readonly role: RoleRecord;
}

/** `DELETE /api/roles`, `DELETE /api/users` e `DELETE /api/news`. */
export interface SuccessBody extends ApiErrorBody {
  readonly success: true;
}

/** Corpo de `PATCH /api/roles` — a rota responde 400 sem `id`. */
export interface RolePatchBody extends UpdateRoleInput {
  readonly id?: string;
}

/**
 * Corpo de `PATCH /api/users`.
 *
 * Além dos campos de `UpdateUserInput`, carrega o `id` do alvo e os overrides
 * de permissão, que a rota aplica por fora do `update` (tabela separada).
 */
export interface UserPatchBody extends UpdateUserInput {
  readonly id?: string;
  readonly permissions?: readonly PermissionOverride[];
}

/* ── Notícias ──────────────────────────────────────────────────── */

/** `GET /api/news`. */
export interface NewsListBody extends ApiErrorBody {
  readonly news: NewsItem[];
}

/** `POST /api/news`. */
export interface NewsCreateBody extends ApiErrorBody {
  readonly success: true;
  readonly news: NewsItem;
}

/* ── Relógio e estatísticas ────────────────────────────────────── */

/**
 * `GET /api/auth` — stub legado: o caminho paralelo de credenciais foi
 * removido e a rota só responde a quem ainda a consulta.
 */
export interface AuthUsersBody {
  readonly users: readonly unknown[];
}

/** `GET /api/time`. */
export interface TimeBody extends ApiErrorBody {
  readonly serverTime: string;
}

/**
 * `GET /api/stats` — o corpo é literalmente a saída de
 * `ReadRepository.getStats` (`QueueStats`), inclusive o fallback `noDb`.
 */
export type StatsBody = QueueStats;

/* ── Fila: respostas ───────────────────────────────────────────── */

/** `POST /api/queue/call`. */
export interface QueueCallBody extends ApiErrorBody {
  readonly success: true;
  readonly number: number;
  readonly numberStr: string;
  readonly type: SequenceType;
  readonly wraparound: boolean;
  /** `true` quando o servidor não está configurado — o cliente cai no local. */
  readonly useLocal?: boolean;
}

/** `POST /api/queue/recall`. */
export interface QueueRecallBody extends ApiErrorBody {
  readonly success: true;
  readonly number: number;
  readonly type: SequenceType;
}

/** `POST /api/queue/reset`. */
export interface QueueResetBody extends ApiErrorBody {
  readonly success: true;
  readonly sectors: string[];
}

/**
 * `GET /api/queue/recent` — fallback de polling quando o SSE não abre.
 *
 * `calls` são as chamadas pós-reset do setor (`resetAt` é o marcador que deixa
 * o cliente detectar um reset feito em outro aparelho).
 */
export interface QueueRecentBody extends ApiErrorBody {
  readonly calls: readonly RecentCall[];
  readonly resetAt: string | null;
}

/** `POST /api/queue/sync`. */
export interface QueueSyncBody extends ApiErrorBody {
  readonly success: true;
  readonly sector: string;
  readonly type: SequenceType;
  readonly nextNumber: number;
  readonly numberStr: string;
  readonly message: string;
}

/* ── Fila: corpos de requisição ────────────────────────────────── */

/**
 * Campos são todos opcionais porque vêm do cliente: a validação (e o 400)
 * acontece na rota, e é a rota que estreita `sector` para `SectorId` com
 * `isSectorId()`.
 */
export interface CallRequestBody {
  readonly sector?: string;
  readonly type?: string;
}

/** Corpo de `POST /api/queue/recall`. */
export interface RecallRequestBody {
  readonly sector?: string;
}

/** Corpo de `POST /api/queue/reset` — `"all"` expande para todos os setores. */
export interface ResetRequestBody {
  readonly sector?: string;
}

/** Corpo de `POST /api/queue/sync`. */
export interface SyncRequestBody {
  readonly sector?: string;
  readonly type?: string;
  readonly nextNumber?: unknown;
}

/* ── Reuso ─────────────────────────────────────────────────────── */

/** `POST /api/roles`. */
export type CreateRoleRequest = CreateRoleInput;

/** `POST /api/users`. */
export type CreateUserRequest = CreateUserInput;
