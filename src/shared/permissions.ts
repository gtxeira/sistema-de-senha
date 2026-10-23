/**
 * Registro canônico de permissões do sistema.
 *
 * As chaves vivem NO CÓDIGO (não no banco) porque são o contrato entre
 * proxy, APIs, UI e testes — o admin só escolhe quais das chaves existentes
 * cada cargo/usuário recebe; criar uma chave nova é mudança de código.
 *
 * Este módulo é puro (sem I/O, sem banco) e importado pelo `proxy.ts`,
 * que roda em Edge Runtime — mantenha-o livre de dependências pesadas.
 */
import { PERMISSIONS_MAX_AGE, SESSION_ABSOLUTE_MAX_AGE } from './constants';

/* ── Telas ── */
export const SCREEN_HOME = 'tela.home';
export const SCREEN_PAINEL = 'tela.painel';
export const SCREEN_HISTORICO = 'tela.historico';
export const SCREEN_MONITOR = 'tela.monitor';
export const SCREEN_ADMIN = 'tela.admin';
export const SCREEN_ADMIN_FILAS = 'tela.admin.filas';
export const SCREEN_ADMIN_NOTICIAS = 'tela.admin.noticias';
export const SCREEN_ADMIN_USUARIOS = 'tela.admin.usuarios';

/* ── Ações ── */
export const USERS_VIEW = 'usuarios.ver';
export const USERS_CREATE = 'usuarios.criar';
export const USERS_EDIT = 'usuarios.editar';
export const USERS_DELETE = 'usuarios.excluir';
export const ROLES_MANAGE = 'cargos.gerenciar';
export const QUEUE_CALL = 'filas.chamar';
export const QUEUE_RECALL = 'filas.reavancar';
export const QUEUE_RESET = 'filas.resetar';
export const QUEUE_SYNC = 'filas.sincronizar';
export const NEWS_CREATE = 'noticias.criar';
export const NEWS_DELETE = 'noticias.excluir';

/* ── Escopo de setor ── */
export const SECTORS_VIEW_ALL = 'setores.todos.ver';
export const SECTORS_MANAGE_ALL = 'setores.todos.gerenciar';

/**
 * `as const` é o que transforma as chaves acima em literais e, por consequência,
 * permite derivar o union `Permission` abaixo. Sem ele tudo vira `string` e o
 * compilador deixa passar typo em `hasPermission(session, TELA_ADMIN)`.
 */
export const PERMISSION_GROUPS = [
  {
    items: [
      { label: 'Home', permission: SCREEN_HOME },
      { label: 'Painel de chamadas', permission: SCREEN_PAINEL },
      { label: 'Histórico', permission: SCREEN_HISTORICO },
      { label: 'Monitores (telas de espera)', permission: SCREEN_MONITOR },
      { label: 'Administração (acesso à seção)', permission: SCREEN_ADMIN },
      {
        label: 'Admin · Filas e sincronização',
        permission: SCREEN_ADMIN_FILAS,
      },
      { label: 'Admin · Notícias', permission: SCREEN_ADMIN_NOTICIAS },
      {
        label: 'Admin · Usuários e permissões',
        permission: SCREEN_ADMIN_USUARIOS,
      },
    ],
    key: 'telas',
    label: 'Telas',
  },
  {
    items: [
      { label: 'Visualizar usuários', permission: USERS_VIEW },
      { label: 'Criar usuários', permission: USERS_CREATE },
      { label: 'Editar usuários', permission: USERS_EDIT },
      { label: 'Excluir usuários', permission: USERS_DELETE },
      { label: 'Gerenciar cargos e permissões', permission: ROLES_MANAGE },
      { label: 'Chamar senhas', permission: QUEUE_CALL },
      { label: 'Repetir última senha', permission: QUEUE_RECALL },
      { label: 'Zerar filas', permission: QUEUE_RESET },
      { label: 'Sincronizar senhas', permission: QUEUE_SYNC },
      { label: 'Publicar notícias', permission: NEWS_CREATE },
      { label: 'Excluir notícias', permission: NEWS_DELETE },
    ],
    key: 'acoes',
    label: 'Ações',
  },
  {
    items: [
      {
        label: 'Visualizar filas de todos os setores',
        permission: SECTORS_VIEW_ALL,
      },
      {
        label: 'Operar filas de todos os setores',
        permission: SECTORS_MANAGE_ALL,
      },
    ],
    key: 'escopo',
    label: 'Escopo de setor',
  },
] as const;

/** Todas as chaves válidas, na ordem dos grupos. */
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.permission),
);

/** Toda chave de permissão aceita pelo sistema (derivada de `PERMISSION_GROUPS`). */
export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * Guardamos como `Set<string>` (não `Set<Permission>`) de propósito: o cargo e o
 * usuário trazem strings do banco e precisam ser filtradas *sem* cast.
 */
const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

// `Object.fromEntries` devolve `{ [k: string]: string }` — o compilador não
// consegue provar que as 21 chaves saíram todas. A asserção abaixo é exatamente
// essa prova: as entradas vêm de PERMISSION_GROUPS, a mesma fonte de Permission.
export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.permission, item.label] as const),
  ),
) as Record<Permission, string>;

/**
 * Qualquer shape que carrega permissões: sessão do servidor
 * (`session.user.permissions`), snapshot do localStorage (`{ permissions }`)
 * ou o próprio `session.user`.
 */
export interface PermissionCarrier {
  permissions?: readonly string[] | null;
  sector?: null | string;
  user?: PermissionCarrier | null;
}

/** Override linha-a-linha de um usuário sobre as permissões do cargo. */
export interface PermissionOverride {
  readonly granted: boolean;
  readonly permission: string;
}

/**
 * Regra única de escopo de setor.
 *
 * 1. quem tem a permissão de escopo acessa qualquer setor;
 * 2. quem tem setor asignado acessa o próprio setor;
 * 3. sem setor e sem permissão → negado.
 *
 * @param sector setor alvo (`null`/ausente = sem destino resolvido → negado)
 * @param mode leitura (filas/monitores/estatísticas) ou escrita (operações)
 */
export function canAccessSector(
  sessionOrUser: PermissionCarrier | null | undefined,
  sector: null | string,
  mode: 'read' | 'write' = 'read',
): boolean {
  const scopePermission =
    mode === 'write' ? SECTORS_MANAGE_ALL : SECTORS_VIEW_ALL;
  if (hasPermission(sessionOrUser, scopePermission)) return true;
  const ownSector = sessionOrUser?.sector ?? sessionOrUser?.user?.sector;
  return !!sector && ownSector === sector;
}

/**
 * Permissões efetivas de um usuário:
 * (permissões do cargo ∪ grants do usuário) − negações do usuário.
 *
 * @returns subconjunto de ALL_PERMISSIONS, em ordem canônica
 */
export function computeEffectivePermissions(
  rolePermissions: readonly string[] | null | undefined = [],
  userPermissions: readonly PermissionOverride[] | null | undefined = [],
): Permission[] {
  const set = new Set(
    (rolePermissions ?? []).filter((p) => PERMISSION_SET.has(p)),
  );
  for (const row of userPermissions ?? []) {
    if (!PERMISSION_SET.has(row.permission)) continue;
    if (row.granted) set.add(row.permission);
    else set.delete(row.permission);
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export function hasAnyPermission(
  sessionOrUser: PermissionCarrier | null | undefined,
  ...permissions: Permission[]
): boolean {
  const perms = permissionsOf(sessionOrUser);
  return permissions.some((p) => perms.includes(p));
}

export function hasPermission(
  sessionOrUser: PermissionCarrier | null | undefined,
  permission: Permission,
): boolean {
  return permissionsOf(sessionOrUser).includes(permission);
}

/**
 * Extrai o array de permissões de qualquer shape de sessão:
 * sessão do servidor (`session.user.permissions`) ou snapshot do
 * localStorage (`{ permissions }`).
 */
export function permissionsOf(
  sessionOrUser: PermissionCarrier | null | undefined,
): readonly string[] {
  return sessionOrUser?.permissions ?? sessionOrUser?.user?.permissions ?? [];
}

/* ── Rotas ── */

/**
 * Registro canônico de rotas de tela: prefixo da URL → o que a rota exige.
 *
 * É a **única** fonte de verdade sobre "qual rota existe e o que ela
 * exige". Antes o `proxy.ts` mantinha duas listas paralelas (`PUBLIC` e
 * `PROTECTED`) que duplicavam este registro — duplicação perigosa, porque
 * uma tela registrada aqui e esquecida lá caía no `catch-all` do proxy:
 * a checagem de permissão nem era consultada e a página abria para
 * qualquer usuário autenticado.
 *
 * `sectorScoped` marca as rotas cujo alvo é um setor da URL
 * (`/monitor/<setor>`): o setor é extraído da própria URL e vale para o
 * usuário do setor ou para quem tem a permissão de escopo.
 */
export const ROUTE_RULES = [
  { permission: SCREEN_HOME, prefix: '/home' },
  { permission: SCREEN_PAINEL, prefix: '/painel' },
  { permission: SCREEN_HISTORICO, prefix: '/historico' },
  { permission: SCREEN_MONITOR, prefix: '/monitor', sectorScoped: true },
  { permission: SCREEN_ADMIN, prefix: '/admin' },
] as const;

/** O que uma rota exige de quem a acessa. */
export interface RouteRequirement {
  /** Permissão de tela exigida pela rota. */
  readonly permission: Permission;
  /**
   * Setor alvo da rota, quando ela é escopada (`/monitor/<setor>`).
   * `null` = rota sem escopo de setor.
   */
  readonly sector: null | string;
}

/**
 * Casa a URL com o registro de rotas.
 *
 * @returns o que a rota exige, ou `null` quando a rota **não está
 *   registrada** — o proxy trata "não registrada" como negado
 *   (fail-closed), e um teste varre `src/app` para garantir que toda
 *   página do app está classificada aqui.
 */
export function matchRoute(pathname: string): RouteRequirement | null {
  const rule = ROUTE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'),
  );
  if (!rule) return null;

  const sectorScoped = 'sectorScoped' in rule && rule.sectorScoped === true;
  return {
    permission: rule.permission,
    sector: sectorScoped ? segmentAfter(pathname, rule.prefix) : null,
  };
}

/**
 * Problema de frescor de um token de sessão.
 *
 * - `auth_at` (idade máxima SESSION_ABSOLUTE_MAX_AGE) → sessão expirada;
 * - `perms_at` (idade máxima PERMISSIONS_MAX_AGE) → permissões stale:
 *   exige refresh antes de autorizar qualquer coisa.
 *
 * @param user `session.user` (claims authAt/permsAt em ms)
 */
export function sessionFreshnessProblem(
  user: null | undefined | object,
  now: number = Date.now(),
): 'expired' | 'stale' | null {
  const { authAt, permsAt } = asClaims(user);
  if (
    typeof authAt !== 'number' ||
    now - authAt > SESSION_ABSOLUTE_MAX_AGE * 1000
  ) {
    return 'expired';
  }
  if (
    typeof permsAt !== 'number' ||
    now - permsAt > PERMISSIONS_MAX_AGE * 1000
  ) {
    return 'stale';
  }
  return null;
}

/** Claims de frescor lidos de `session.user` (vêm do JWT). */
interface SessionClaims {
  readonly authAt?: unknown;
  readonly permsAt?: unknown;
}

/**
 * Aceita qualquer shape de sessão (NextAuth, snapshot do cliente, claims
 * decodificados) — por isso o parâmetro é `object` e não uma forma fixa: o
 * único contrato aqui é "tem `authAt`/`permsAt` se tiver".
 */
function asClaims(user: null | undefined | object): SessionClaims {
  if (user === null || user === undefined) return {};
  return user;
}

/**
 * Primeiro segmento depois do prefixo da rota (`/monitor/farmacia` →
 * `farmacia`). `null` quando a URL não tem o segmento.
 */
function segmentAfter(pathname: string, prefix: string): null | string {
  if (!pathname.startsWith(prefix + '/')) return null;
  const segment = pathname.slice(prefix.length + 1).split('/')[0];
  return segment || null;
}
