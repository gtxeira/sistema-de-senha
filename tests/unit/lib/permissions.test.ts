import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  QUEUE_CALL,
  QUEUE_RESET,
  SCREEN_ADMIN,
  SCREEN_HOME,
  SECTORS_MANAGE_ALL,
  SECTORS_VIEW_ALL,
  USERS_VIEW,
  canAccessSector,
  computeEffectivePermissions,
  hasPermission,
  monitorSectorFor,
  screenPermissionFor,
  sessionFreshnessProblem,
} from "@/lib/permissions";
import {
  PERMISSIONS_MAX_AGE,
  SESSION_ABSOLUTE_MAX_AGE,
} from "@/lib/constants";

describe("computeEffectivePermissions", () => {
  it("retorna a união das permissões do cargo", () => {
    const result = computeEffectivePermissions(
      [SCREEN_HOME, QUEUE_CALL],
      [],
    );
    expect(result).toEqual([SCREEN_HOME, QUEUE_CALL]);
  });

  it("grants do usuário somam ao cargo", () => {
    const result = computeEffectivePermissions(
      [SCREEN_HOME],
      [{ permission: USERS_VIEW, granted: true }],
    );
    expect(result).toEqual([SCREEN_HOME, USERS_VIEW]);
  });

  it("denials do usuário vencem o cargo", () => {
    const result = computeEffectivePermissions(
      [SCREEN_HOME, QUEUE_CALL],
      [{ permission: QUEUE_CALL, granted: false }],
    );
    expect(result).toEqual([SCREEN_HOME]);
  });

  it("deny de permissão inexistente no cargo é um no-op", () => {
    const result = computeEffectivePermissions(
      [SCREEN_HOME],
      [{ permission: QUEUE_RESET, granted: false }],
    );
    expect(result).toEqual([SCREEN_HOME]);
  });

  it("ignora chaves desconhecidas (registro fixo no código)", () => {
    const result = computeEffectivePermissions(
      ["permissao.fantasma", SCREEN_HOME],
      [{ permission: "outra.fantasma", granted: true }],
    );
    expect(result).toEqual([SCREEN_HOME]);
  });

  it("grants e denies do mesmo cargo se cancelam (deny vence)", () => {
    const result = computeEffectivePermissions(
      [QUEUE_CALL],
      [
        { permission: QUEUE_CALL, granted: true },
        { permission: QUEUE_CALL, granted: false },
      ],
    );
    expect(result).toEqual([]);
  });

  it("resultado segue a ordem canônica do registro", () => {
    const result = computeEffectivePermissions(
      [USERS_VIEW, SCREEN_HOME, QUEUE_RESET],
      [],
    );
    // Filtra por `includes` em vez de sort()+indexOf: sem contexto o array de
    // literais alarga para string[] e o indexOf(Permission) não compilaria.
    const esperadas = [SCREEN_HOME, QUEUE_RESET, USERS_VIEW];
    expect(result).toEqual(
      ALL_PERMISSIONS.filter((p) => esperadas.includes(p)),
    );
  });

  it("entradas vazias viram lista vazia", () => {
    expect(computeEffectivePermissions()).toEqual([]);
    expect(computeEffectivePermissions(null, null)).toEqual([]);
  });
});

describe("hasPermission / shape da sessão", () => {
  it("lê session.user.permissions (sessão do servidor)", () => {
    expect(hasPermission({ user: { permissions: [SCREEN_ADMIN] } }, SCREEN_ADMIN)).toBe(true);
    expect(hasPermission({ user: { permissions: [SCREEN_ADMIN] } }, USERS_VIEW)).toBe(false);
  });

  it("lê permissions direto (snapshot do localStorage)", () => {
    expect(hasPermission({ permissions: [USERS_VIEW] }, USERS_VIEW)).toBe(true);
  });

  it("sem sessão retorna false", () => {
    expect(hasPermission(null, SCREEN_HOME)).toBe(false);
    expect(hasPermission(undefined, SCREEN_HOME)).toBe(false);
  });
});

describe("canAccessSector (escopo de setor)", () => {
  const own = { sector: "farmacia", permissions: [] };
  const scopedRead = { sector: null, permissions: [SECTORS_VIEW_ALL] };
  const scopedWrite = { sector: null, permissions: [SECTORS_MANAGE_ALL] };
  const noSector = { sector: null, permissions: [] };

  it("setor próprio sempre pode ser lido", () => {
    expect(canAccessSector(own, "farmacia", "read")).toBe(true);
  });

  it("setor próprio pode ser escrito", () => {
    expect(canAccessSector(own, "farmacia", "write")).toBe(true);
  });

  it("outro setor é negado sem escopo", () => {
    expect(canAccessSector(own, "recepcao", "read")).toBe(false);
    expect(canAccessSector(own, "recepcao", "write")).toBe(false);
  });

  it("setores.todos.ver libera leitura de qualquer setor", () => {
    expect(canAccessSector(scopedRead, "recepcao", "read")).toBe(true);
    // mas não escrita
    expect(canAccessSector(scopedRead, "recepcao", "write")).toBe(false);
  });

  it("setores.todos.gerenciar libera escrita em qualquer setor", () => {
    expect(canAccessSector(scopedWrite, "recepcao", "write")).toBe(true);
    // escrita não implica leitura: são chaves separadas por design
    // (para ver filtros/monitores é preciso setores.todos.ver)
    expect(canAccessSector(scopedWrite, "recepcao", "read")).toBe(false);
  });

  it("sem setor e sem permissão, nega tudo", () => {
    expect(canAccessSector(noSector, "farmacia", "read")).toBe(false);
    expect(canAccessSector(noSector, "farmacia", "write")).toBe(false);
    expect(canAccessSector(noSector, null, "read")).toBe(false);
  });
});

describe("screenPermissionFor (regras do proxy)", () => {
  it("mapeia as rotas de tela", () => {
    expect(screenPermissionFor("/home")).toBe(SCREEN_HOME);
    expect(screenPermissionFor("/painel")).toBe("tela.painel");
    expect(screenPermissionFor("/historico")).toBe("tela.historico");
    expect(screenPermissionFor("/monitor")).toBe("tela.monitor");
    expect(screenPermissionFor("/admin")).toBe(SCREEN_ADMIN);
  });

  it("casa subrotas", () => {
    expect(screenPermissionFor("/admin/qualquer")).toBe(SCREEN_ADMIN);
    expect(screenPermissionFor("/monitor/farmacia")).toBe("tela.monitor");
  });

  it("não casa prefixo parcial", () => {
    expect(screenPermissionFor("/homem")).toBeNull();
    expect(screenPermissionFor("/administracao")).toBeNull();
  });

  it("rotas fora de telas retornam null", () => {
    expect(screenPermissionFor("/login")).toBeNull();
    expect(screenPermissionFor("/")).toBeNull();
  });
});

describe("monitorSectorFor", () => {
  it("extrai o setor de /monitor/<setor>", () => {
    expect(monitorSectorFor("/monitor/farmacia")).toBe("farmacia");
    expect(monitorSectorFor("/monitor/recepcao")).toBe("recepcao");
  });

  it("retorna null fora do monitor", () => {
    expect(monitorSectorFor("/home")).toBeNull();
    expect(monitorSectorFor("/monitor/")).toBeNull();
    expect(monitorSectorFor("/monitor")).toBeNull();
  });
});

describe("sessionFreshnessProblem (auth_at / perms_at)", () => {
  const now = Date.now();

  it("sessão nova não tem problema", () => {
    expect(
      sessionFreshnessProblem({ authAt: now, permsAt: now }, now),
    ).toBeNull();
  });

  it("perms_at dentro da janela continua válido", () => {
    const permsAt = now - (PERMISSIONS_MAX_AGE - 60) * 1000;
    expect(sessionFreshnessProblem({ authAt: now, permsAt }, now)).toBeNull();
  });

  it("perms_at vencido ⇒ stale (exige refresh)", () => {
    const permsAt = now - (PERMISSIONS_MAX_AGE + 1) * 1000;
    expect(
      sessionFreshnessProblem({ authAt: now, permsAt }, now),
    ).toBe("stale");
  });

  it("auth_at vencido ⇒ expired (re-login) — mesmo com perms_at novo", () => {
    const authAt = now - (SESSION_ABSOLUTE_MAX_AGE + 1) * 1000;
    expect(
      sessionFreshnessProblem({ authAt, permsAt: now }, now),
    ).toBe("expired");
  });

  it("claims ausentes (token legado) ⇒ tratado como expirado/stale", () => {
    expect(sessionFreshnessProblem({ id: "u1" }, now)).toBe("expired");
    expect(sessionFreshnessProblem(undefined, now)).toBe("expired");
    // auth_at novo sem perms_at ⇒ só as permissões estão stale (refresh resolve)
    expect(sessionFreshnessProblem({ authAt: now }, now)).toBe("stale");
  });
});
