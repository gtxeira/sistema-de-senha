import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_KEY } from "@/lib/constants";
import {
  readCachedSession,
  useSessionStore,
} from "@/stores/use-session-store";
import type { User } from "next-auth";

/**
 * A store de sessão é a fonte única da sessão no client.
 *
 * Ela espelha as claims do cookie httpOnly no `localStorage` (cache) e as
 * publica em memória para a UI. Nada aqui autoriza: quem autoriza é o
 * proxy (páginas) e o `requirePermission()` das rotas de API.
 */

/** Usuário de mentira com o shape do `User` do Auth.js. */
function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    name: "João",
    email: "joao@central.local",
    sector: "farmacia",
    guiche: "guiche-1",
    initials: "JO",
    permissions: ["tela.home", "tela.admin"],
    authAt: 1,
    permsAt: 1,
    ...overrides,
  } as User;
}

beforeEach(() => {
  window.localStorage.clear();
  useSessionStore.setState({ user: null });
});

describe("use-session-store — cache local", () => {
  it("a chave do espelho é a de sempre", () => {
    expect(SESSION_KEY).toBe("saude-attendant-session");
  });

  it("lê o espelho gravado", () => {
    const user = fakeUser();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    expect(readCachedSession()).toEqual(user);
  });

  it("sem espelho, devolve null", () => {
    expect(readCachedSession()).toBeNull();
  });

  it("espelho corrompido é tratado como 'sem sessão'", () => {
    window.localStorage.setItem(SESSION_KEY, "not-json");
    expect(readCachedSession()).toBeNull();
  });

  it("espelho sem id é ignorado", () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ name: "Sem id" }));
    expect(readCachedSession()).toBeNull();
  });
});

describe("use-session-store — ações", () => {
  it("setUser publica na store e grava o espelho", () => {
    const user = fakeUser();
    useSessionStore.getState().setUser(user);

    expect(useSessionStore.getState().user).toEqual(user);
    expect(
      JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null"),
    ).toEqual(user);
  });

  it("clear limpa a store e o espelho", () => {
    useSessionStore.getState().setUser(fakeUser());
    useSessionStore.getState().clear();

    expect(useSessionStore.getState().user).toBeNull();
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("a store começa sem usuário (o bootstrap semeia num efeito)", () => {
    // O estado inicial é `null` no servidor e no client: semear no module
    // init faria o primeiro render do client diferir do HTML do servidor
    // (hydration mismatch) em toda tela que lê a sessão.
    expect(useSessionStore.getState().user).toBeNull();
  });
});

describe("use-session-store — sincronização entre abas", () => {
  it("reage ao evento storage de outra aba (mesma chave)", () => {
    const user = fakeUser();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));

    // O navegador só dispara `storage` nas outras abas — simulamos a
    // chegada do espelho vindo de fora.
    window.dispatchEvent(
      new StorageEvent("storage", { key: SESSION_KEY, newValue: JSON.stringify(user) }),
    );

    expect(useSessionStore.getState().user).toEqual(user);
  });

  it("ignora o evento storage de outra chave", () => {
    useSessionStore.getState().setUser(fakeUser());

    window.dispatchEvent(
      new StorageEvent("storage", { key: "saude-queue-state", newValue: "{}" }),
    );

    // A sessão não é mexida por mudanças da fila (era o cruzamento do
    // evento `storage` sem filtro de chave).
    expect(useSessionStore.getState().user).not.toBeNull();
  });
});
