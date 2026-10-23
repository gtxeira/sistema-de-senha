export type CallType = 'normal' | 'preferencial' | 'preferential';
export type RoleKey = 'admin' | 'attendant';
// ── Tipos de domínio ──────────────────────────────────────────
// Chaves válidas das entidades do sistema. Servem de fonte única para os
// unions usados por repositórios, rotas e componentes.
export type SectorId = 'farmacia' | 'recepcao';
/**
 * Escopo de setor selecionado numa tela: um setor real ou o pseudo-setor
 * "Todos" (`ALL_SECTORS`) — a visão agregada de todos os setores, que só
 * faz sentido para quem tem `setores.todos.ver`.
 */
export type SectorScope = SectorId | typeof ALL_SECTORS;
// Tipo da sequência (banco) — diferente de `callType`: o banco guarda a
// grafia "preferencial" enquanto o cliente envia "preferential".
export type SequenceType = 'normal' | 'preferencial';

export interface SectorInfo {
  readonly id: SectorScope;
  readonly name: string;
  readonly shortName: string;
}

// ── Setores ──
export const SECTORS = {
  farmacia: { id: 'farmacia', name: 'Farmácia', shortName: 'FARMÁCIA' },
  recepcao: { id: 'recepcao', name: 'Recepção Saúde', shortName: 'RECEPÇÃO' },
} as const satisfies Record<SectorId, SectorInfo>;
export const DEFAULT_SECTOR = 'farmacia';
export const ALL_SECTORS = 'all';

/**
 * Info do pseudo-setor "Todos". Ele não existe no banco — é a visão
 * agregada de todos os setores (histórico/estatísticas). Aparece na UI
 * (seletor e sidebar) para o caso "nenhum setor selecionado" ficar
 * explícito em vez de cair num setor por padrão.
 */
export const ALL_SECTORS_INFO: SectorInfo = {
  id: ALL_SECTORS,
  name: 'Todos os Setores',
  shortName: 'TODOS',
};

/** Lookup tolerante: `undefined` para setor inválido, em vez de estourar. */
export function getSector(id: string): SectorInfo | undefined {
  return isSectorId(id) ? SECTORS[id] : undefined;
}

/**
 * Lookup de escopo: resolve um setor real (`getSector`) e também o
 * pseudo-setor "Todos" (`ALL_SECTORS_INFO`).
 *
 * @returns `undefined` para valor inválido, em vez de estourar.
 */
export function getSectorScope(id?: string): SectorInfo | undefined {
  if (id === undefined) return undefined;
  if (id === ALL_SECTORS) return ALL_SECTORS_INFO;
  return getSector(id);
}

/**
 * Checagem de setor que o TS enxerga.
 *
 * `Object.hasOwn(SECTORS, x)` valida em runtime mas **não** estreita o tipo
 * (`x` segue `string`), e `SECTORS[x]` exige `SectorId` — o predicado resolve
 * os dois lados numa chamada só. Comportamento idêntico ao guard manual
 * (`!x || !Object.hasOwn(...)`), com um `typeof` explícito porque o valor
 * costuma vir de `request.json()`.
 */
export function isSectorId(value: unknown): value is SectorId {
  return typeof value === 'string' && Object.hasOwn(SECTORS, value);
}

/** Predicado de escopo: setor real ou "Todos". */
export function isSectorScope(value?: unknown): value is SectorScope {
  return value === ALL_SECTORS || isSectorId(value);
}

// ── Roles ──
export const ROLES = {
  ADMIN: 'admin',
  ATTENDANT: 'attendant',
} as const satisfies Record<string, RoleKey>;
export const DEFAULT_ROLE = ROLES.ATTENDANT;

// ── Tipos de chamada ──
export const CALL_TYPES = {
  NORMAL: 'normal',
  PREFERENCIAL: 'preferencial',
  PREFERENTIAL: 'preferential',
} as const satisfies Record<string, CallType>;
export const TYPE_FIELDS = {
  preferencial: 'priorityCurrent',
  preferential: 'priorityCurrent',
  normal: 'normalCurrent',
} as const satisfies Record<CallType, string>;
export const TYPE_LABELS = {
  preferencial: 'Preferencial',
  preferential: 'Preferencial',
  normal: 'Normal',
} as const satisfies Record<CallType, string>;
export const TYPE_PREFIXES = {
  preferencial: 'P',
  preferential: 'P',
  normal: 'N',
} as const satisfies Record<CallType, string>;

// ── Fila ──
export const MIN_QUEUE_NUMBER = 0;
export const MAX_QUEUE_NUMBER = 999;
export const DEFAULT_QUEUE_NUMBER = MIN_QUEUE_NUMBER;
export const NO_PASSWORD = null;
export const DEFAULT_RECENT_LIMIT = 30;

// ── Estatísticas ──
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 30;

// ── Paginação ──
export const PAGE_SIZES = { historico: 20, painel: 10 };
/** Teto de `pageSize` aceito pela API — evita pedir a tabela inteira. */
export const MAX_PAGE_SIZE = 100;

// ── Histórico ──
export const HISTORY_LIMITS = { painel: 100, monitor: 30 };

// ── Timing ──
export const CLOCK_INTERVAL = 1000;
export const KEEPALIVE_INTERVAL = 30000;
export const POLLING_INTERVAL = 3000;
export const NEWS_CAROUSEL_INTERVAL = 5000;
export const SSE_BACKOFF_BASE = 1000;
export const SSE_BACKOFF_MAX = 30000;
// Teto de streams SSE simultâneos por setor. Cada conexão segura um file
// descriptor e um timer de keepalive; sem teto, um cliente poderia abrir streams
// ilimitados e exaurir recursos do processo Node.
export const MAX_SSE_CONNECTIONS_PER_SECTOR = 50;

// ── Eventos SSE ──
export const SSE_EVENT_TYPES = {
  CALL: 'call',
  RECALL: 'recall',
  RESET: 'reset',
} as const;

// ── Auth ──
export const USERNAME_REGEX = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;
export const USERNAME_REGEX_LABEL = 'Use o formato nome.sobrenome';
export const BCRYPT_SALT_ROUNDS = 10;
export const EMAIL_DOMAIN = '@central-atendimento.local';
export const DEFAULT_INITIALS = 'AT';
export const DEFAULT_NAME = 'Atendente';

// Sessão em dois níveis:
// - access token = JWT de sessão do Auth.js, validade de 15min (rotaciona a
//   cada request de sessão, então na prática é um idle timeout);
// - refresh token = cookie opaco guardado (hash) no banco por 12h contadas
//   do login, rotacionado a cada uso, com detecção de reuso.
export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // segundos
export const PERMISSIONS_MAX_AGE = 15 * 60; // segundos: frescor máximo das permissões no JWT
export const SESSION_ABSOLUTE_MAX_AGE = 12 * 60 * 60; // segundos: teto absoluto da sessão desde o login
export const REFRESH_TOKEN_MAX_AGE = 12 * 60 * 60; // segundos: janela absoluta do refresh token
// Janela de graça para rotações concorrentes do mesmo refresh token (ex.:
// intervalo do client disparando junto com um redirect do proxy). Dentro da
// graça o reuso NÃO revoga a família — apenas sinaliza "outro fluxo já
// renovou". Fora da graça é tratado como roubo de token.
export const REFRESH_REUSE_GRACE = 10; // segundos
export const REFRESH_COOKIE_NAME = 'app.refresh-token';
// Rota de login — a página de sign-in do Auth.js.
//
// Vive no código (e não só em `pages.signIn`, no config do Auth.js) porque
// o `proxy.ts` precisa dela em dois pontos: para não redirecionar o
// usuário para a própria página de login (auto-loop) e para devolver quem
// já está autenticado para a home.
export const SIGN_IN_PATH = '/login';
// Intervalo de renovação proativa no client (menor que PERMISSIONS_MAX_AGE
// para que o refresh nunca fique stale com a aba aberta).
export const SESSION_REFRESH_INTERVAL = 10 * 60 * 1000; // ms

// ── Guichê ──
export const DEFAULT_GUICHE = 'none';

// ── Notícia ──
export const NEWS_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];
export const NEWS_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const NEWS_BUCKET = 'news-images';
export const NEWS_DIR = 'public/news';
export const NEWS_MAX_ACTIVE = 10;

// ── Locale / Timezone ──
export const LOCALE = 'pt-BR';
export const APP_TIMEZONE = 'America/Sao_Paulo';
export const SERVER_TIME_SYNC_INTERVAL = 60000; // 60s entre sincronizações com servidor

// ── Draft ──
export const DRAFT_PREFIX = 'draft-';

// ── Speech/TTS ──
export const TTS_MAX_NUMBER = 1000;
export const TTS_DEDUP_WINDOW = 10000;
export const TTS_VOICE_TIMEOUT = 1500;
export const TTS_WATCHDOG_INTERVAL = 3000;
export const TTS_SPEECH_RATE = 0.88;
export const TTS_PITCH = 1;
export const TTS_VOLUME = 1;
export const TTS_RETRY_DELAY = 400;
export const TTS_BEEP_FREQ_LOW = 880;
export const TTS_BEEP_FREQ_HIGH = 1100;
export const TTS_BEEP_DURATION = 0.18;
export const TTS_BEEP_OFFSET = 0.24;
export const TTS_GAIN = 0.6;
export const TTS_POST_BEEP_BUFFER = 100;
export const TTS_SPEAK_DELAY = 100;
export const TTS_PRE_SPEECH_PAUSE = 250;

// ── Rotas ──
export const API_ROUTES = {
  QUEUE_CALL: '/api/queue/call',
  QUEUE_RECENT: '/api/queue/recent',
  QUEUE_EVENTS: '/api/queue/events',
  QUEUE_SYNC: '/api/queue/sync',
  QUEUE_RESET: '/api/queue/reset',
  QUEUE_RECALL: '/api/queue/recall',
  AUTH: '/api/auth',
  LOGIN: '/login',
  HOME: '/home',
  TIME: '/api/time',
} as const;

// ── Navegação ──
export const NAV_ITEMS = [
  { label: 'Home', href: '/home', icon: 'Home' },
  { label: 'Administração', href: '/admin', icon: 'Settings', onlyAdmin: true },
  { label: 'Chamadas', href: '/painel', icon: 'Monitor' },
  { label: 'Histórico', href: '/historico', icon: 'History' },
];

// ── Atalhos de teclado ──
export const KEYBOARD_SHORTCUTS = {
  INPUT_TAGS: ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'],
  NORMAL_CALL: ['ArrowRight', 'PageDown', 'Enter', ' '],
  PRIORITY_CALL: ['ArrowLeft', 'PageUp'],
  RECALL: ['ArrowUp', 'Home'],
};

// ── Chaves de armazenamento ──
export const QUEUE_KEY = 'saude-queue-state';
// Último marcador de reset visto por setor. Persistido para que um reload
// consiga comparar com o servidor — sem isso, um monitor que ficou desligado
// durante o reset adotaria o marcador novo e jamais invalidaria a fila velha.
export const RESET_MARKER_KEY = 'saude-queue-reset-markers';
export const SESSION_KEY = 'saude-attendant-session';

// ── Guichês ──
export const GUICHES = [
  { id: 'none', name: 'Sem guichê' },
  { id: 'guiche-1', name: 'Guichê 1' },
  { id: 'guiche-2', name: 'Guichê 2' },
  { id: 'guiche-3', name: 'Guichê 3' },
  { id: 'guiche-4', name: 'Guichê 4' },
];
