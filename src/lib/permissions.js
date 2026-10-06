/**
 * Registro canônico de permissões do sistema.
 *
 * As chaves vivem NO CÓDIGO (não no banco) porque são o contrato entre
 * proxy, APIs, UI e testes — o admin só escolhe quais das chaves existentes
 * cada cargo/usuário recebe; criar uma chave nova é mudança de código.
 *
 * Este módulo é puro (sem I/O, sem banco) e importado pelo `proxy.js`,
 * que roda em Edge Runtime — mantenha-o livre de dependências pesadas.
 */
import {
  PERMISSIONS_MAX_AGE,
  SESSION_ABSOLUTE_MAX_AGE,
} from "./constants.js";

/* ── Telas ── */
export const SCREEN_HOME = "tela.home";
export const SCREEN_PAINEL = "tela.painel";
export const SCREEN_HISTORICO = "tela.historico";
export const SCREEN_MONITOR = "tela.monitor";
export const SCREEN_ADMIN = "tela.admin";
export const SCREEN_ADMIN_FILAS = "tela.admin.filas";
export const SCREEN_ADMIN_NOTICIAS = "tela.admin.noticias";
export const SCREEN_ADMIN_USUARIOS = "tela.admin.usuarios";

/* ── Ações ── */
export const USERS_VIEW = "usuarios.ver";
export const USERS_CREATE = "usuarios.criar";
export const USERS_EDIT = "usuarios.editar";
export const USERS_DELETE = "usuarios.excluir";
export const ROLES_MANAGE = "cargos.gerenciar";
export const QUEUE_CALL = "filas.chamar";
export const QUEUE_RECALL = "filas.reavancar";
export const QUEUE_RESET = "filas.resetar";
export const QUEUE_SYNC = "filas.sincronizar";
export const NEWS_CREATE = "noticias.criar";
export const NEWS_DELETE = "noticias.excluir";

/* ── Escopo de setor ── */
export const SECTORS_VIEW_ALL = "setores.todos.ver";
export const SECTORS_MANAGE_ALL = "setores.todos.gerenciar";

/**
 * Grupos exibidos na matriz de permissões da tela de administração.
 * A ordem aqui define a ordem de `ALL_PERMISSIONS`.
 */
export const PERMISSION_GROUPS = [
  {
    key: "telas",
    label: "Telas",
    items: [
      { permission: SCREEN_HOME, label: "Home" },
      { permission: SCREEN_PAINEL, label: "Painel de chamadas" },
      { permission: SCREEN_HISTORICO, label: "Histórico" },
      { permission: SCREEN_MONITOR, label: "Monitores (telas de espera)" },
      { permission: SCREEN_ADMIN, label: "Administração (acesso à seção)" },
      { permission: SCREEN_ADMIN_FILAS, label: "Admin · Filas e sincronização" },
      { permission: SCREEN_ADMIN_NOTICIAS, label: "Admin · Notícias" },
      { permission: SCREEN_ADMIN_USUARIOS, label: "Admin · Usuários e permissões" },
    ],
  },
  {
    key: "acoes",
    label: "Ações",
    items: [
      { permission: USERS_VIEW, label: "Visualizar usuários" },
      { permission: USERS_CREATE, label: "Criar usuários" },
      { permission: USERS_EDIT, label: "Editar usuários" },
      { permission: USERS_DELETE, label: "Excluir usuários" },
      { permission: ROLES_MANAGE, label: "Gerenciar cargos e permissões" },
      { permission: QUEUE_CALL, label: "Chamar senhas" },
      { permission: QUEUE_RECALL, label: "Repetir última senha" },
      { permission: QUEUE_RESET, label: "Zerar filas" },
      { permission: QUEUE_SYNC, label: "Sincronizar senhas" },
      { permission: NEWS_CREATE, label: "Publicar notícias" },
      { permission: NEWS_DELETE, label: "Excluir notícias" },
    ],
  },
  {
    key: "escopo",
    label: "Escopo de setor",
    items: [
      { permission: SECTORS_VIEW_ALL, label: "Visualizar filas de todos os setores" },
      { permission: SECTORS_MANAGE_ALL, label: "Operar filas de todos os setores" },
    ],
  },
];

/** Todas as chaves válidas, na ordem dos grupos. */
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.permission),
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.permission, item.label]),
  ),
);

/**
 * Permissões efetivas de um usuário:
 * (permissões do cargo ∪ grants do usuário) − negações do usuário.
 *
 * @param {string[]} [rolePermissions] permissões do cargo
 * @param {Array<{permission: string, granted: boolean}>} [userPermissions] overrides do usuário
 * @returns {string[]} subconjunto de ALL_PERMISSIONS, em ordem canônica
 */
export function computeEffectivePermissions(rolePermissions = [], userPermissions = []) {
  const set = new Set((rolePermissions ?? []).filter((p) => PERMISSION_SET.has(p)));
  for (const row of userPermissions ?? []) {
    if (!PERMISSION_SET.has(row.permission)) continue;
    if (row.granted) set.add(row.permission);
    else set.delete(row.permission);
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/**
 * Extrai o array de permissões de qualquer shape de sessão:
 * sessão do servidor (`session.user.permissions`) ou snapshot do
 * localStorage (`{ permissions }`).
 */
export function permissionsOf(sessionOrUser) {
  return (
    sessionOrUser?.permissions ??
    sessionOrUser?.user?.permissions ??
    []
  );
}

export function hasPermission(sessionOrUser, permission) {
  return permissionsOf(sessionOrUser).includes(permission);
}

export function hasAnyPermission(sessionOrUser, ...permissions) {
  const perms = permissionsOf(sessionOrUser);
  return permissions.some((p) => perms.includes(p));
}

/**
 * Regra única de escopo de setor.
 *
 * 1. quem tem a permissão de escopo acessa qualquer setor;
 * 2. quem tem setor asignado acessa o próprio setor;
 * 3. sem setor e sem permissão → negado.
 *
 * @param {object} sessionOrUser sessão/snapshot do usuário
 * @param {string} sector setor alvo
 * @param {'read'|'write'} mode leitura (filas/monitores/estatísticas) ou escrita (operações)
 */
export function canAccessSector(sessionOrUser, sector, mode = "read") {
  const scopePermission =
    mode === "write" ? SECTORS_MANAGE_ALL : SECTORS_VIEW_ALL;
  if (hasPermission(sessionOrUser, scopePermission)) return true;
  const ownSector = sessionOrUser?.sector ?? sessionOrUser?.user?.sector;
  return !!sector && ownSector === sector;
}

/** Rota de tela → permissão exigida pelo proxy. */
const SCREEN_RULES = [
  { prefix: "/home", permission: SCREEN_HOME },
  { prefix: "/painel", permission: SCREEN_PAINEL },
  { prefix: "/historico", permission: SCREEN_HISTORICO },
  { prefix: "/monitor", permission: SCREEN_MONITOR },
  { prefix: "/admin", permission: SCREEN_ADMIN },
];

/**
 * @param {string} pathname
 * @returns {string|null} permissão de tela exigida (null = não é rota de tela)
 */
export function screenPermissionFor(pathname) {
  const rule = SCREEN_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  return rule ? rule.permission : null;
}

/**
 * Extrai o setor alvo de `/monitor/<sector>`.
 * @returns {string|null}
 */
export function monitorSectorFor(pathname) {
  if (!pathname.startsWith("/monitor/")) return null;
  const segment = pathname.slice("/monitor/".length).split("/")[0];
  return segment || null;
}

/**
 * Problema de frescor de um token de sessão.
 *
 * - `auth_at` (idade máxima SESSION_ABSOLUTE_MAX_AGE) → sessão expirada;
 * - `perms_at` (idade máxima PERMISSIONS_MAX_AGE) → permissões stale:
 *   exige refresh antes de autorizar qualquer coisa.
 *
 * @param {object} user `session.user` (claims authAt/permsAt em ms)
 * @returns {'expired'|'stale'|null}
 */
export function sessionFreshnessProblem(user, now = Date.now()) {
  const authAt = user?.authAt;
  const permsAt = user?.permsAt;
  if (typeof authAt !== "number" || now - authAt > SESSION_ABSOLUTE_MAX_AGE * 1000) {
    return "expired";
  }
  if (typeof permsAt !== "number" || now - permsAt > PERMISSIONS_MAX_AGE * 1000) {
    return "stale";
  }
  return null;
}
