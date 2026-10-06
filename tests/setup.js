import { beforeEach, vi } from "vitest";

// Sessão padrão de teste: admin com todas as permissões e claims de frescor
// novas (`authAt`/`permsAt` são exigidos por requireSession; claims vêm do
// JWT em produção — aqui são geradas em cada chamada para o teste nunca
// estourar o janela de 15min por causa de relógio do teste).
vi.mock("@/auth", async () => {
  const { ALL_PERMISSIONS } = await import("@/lib/permissions.js");
  return {
    // Nome do cookie fixado em src/auth.js — as rotas de refresh o importam.
    SESSION_COOKIE_NAME: "authjs.session-token",
    auth: vi.fn().mockImplementation(async () => ({
      user: {
        id: "c0f4795e-f467-4695-b479-5ef467c695a6",
        name: "Dev Teste",
        email: "dev@teste.com",
        sector: null,
        guiche: "none",
        permissions: [...ALL_PERMISSIONS],
        authAt: Date.now(),
        permsAt: Date.now(),
      },
      expires: new Date(Date.now() + 2 * 86400000).toISOString(),
    })),
  };
});

if (typeof window === "undefined") {
  // Skip DOM-only setup in node environment (e.g. integration tests)
} else {

function makeLocalStorage() {
  const store = new Map();
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const localStorage = makeLocalStorage();

class BroadcastChannelStub {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
  }
  postMessage(data) {
    if (this.onmessage) this.onmessage({ data });
  }
  close() {}
}

beforeEach(() => {
  localStorage.clear();

  Object.defineProperty(window, "localStorage", {
    value: localStorage,
    configurable: true,
  });

  window.dispatchEvent = window.dispatchEvent || (() => true);

  if (!window.BroadcastChannel) {
    window.BroadcastChannel = BroadcastChannelStub;
  }

  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: window.BroadcastChannel,
    configurable: true,
  });

  try {
    if (!navigator.locks) {
      navigator.locks = {
        request: (name, options, callback) => {
          const fn = typeof options === "function" ? options : callback;
          return fn();
        },
      };
    }
  } catch {
    Object.defineProperty(navigator, "locks", {
      value: {
        request: (name, options, callback) => {
          const fn = typeof options === "function" ? options : callback;
          return fn();
        },
      },
      configurable: true,
    });
  }

  if (!("speechSynthesis" in window)) {
    window.speechSynthesis = {
      getVoices: () => [],
      speak: () => {},
      cancel: () => {},
      resume: () => {},
      speaking: false,
      pending: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
});

global.__localStorage = localStorage;

} // end else (window defined)