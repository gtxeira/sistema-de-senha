import { beforeEach, vi } from 'vitest';

// Sessão padrão de teste: admin com todas as permissões e claims de frescor
// novas (`authAt`/`permsAt` são exigidos por requireSession; claims vêm do
// JWT em produção — aqui são geradas em cada chamada para o teste nunca
// estourar o janela de 15min por causa de relógio do teste).
vi.mock('@/auth', async () => {
  const { ALL_PERMISSIONS } = await import('@/shared/permissions');
  return {
    // Nome do cookie fixado em src/auth.ts — as rotas de refresh o importam.
    SESSION_COOKIE_NAME: 'authjs.session-token',
    auth: vi.fn().mockImplementation(async () => ({
      user: {
        id: 'c0f4795e-f467-4695-b479-5ef467c695a6',
        name: 'Dev Teste',
        email: 'dev@teste.com',
        sector: null,
        guiche: 'none',
        permissions: [...ALL_PERMISSIONS],
        authAt: Date.now(),
        permsAt: Date.now(),
      },
      expires: new Date(Date.now() + 2 * 86400000).toISOString(),
    })),
  };
});

if (typeof window === 'undefined') {
  // Skip DOM-only setup in node environment (e.g. integration tests)
} else {
  /** Subconjunto do `Storage` que o código de produção realmente lê. */
  interface StorageLike {
    readonly length: number;
    readonly store: Map<string, string>;
    clear(): void;
    getItem(key: string): null | string;
    key(index: number): null | string;
    removeItem(key: string): void;
    setItem(key: string, value: unknown): void;
  }

  function makeLocalStorage(): StorageLike {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
      key: (index) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    };
  }

  const localStorage = makeLocalStorage();

  /**
   * `BroadcastChannel` não existe no happy-dom, mas o código de fila o usa.
   * Estende `EventTarget` e declara `implements` para casar com o
   * `typeof BroadcastChannel` do DOM sem cast algum.
   */
  class BroadcastChannelStub extends EventTarget implements BroadcastChannel {
    readonly name: string;
    onmessage: BroadcastChannel['onmessage'] = null;
    onmessageerror: BroadcastChannel['onmessageerror'] = null;

    constructor(name: string) {
      super();
      this.name = name;
    }

    close(): void {}

    postMessage(message: unknown): void {
      this.onmessage?.(new MessageEvent('message', { data: message }));
    }
  }

  /**
   * Instala uma propriedade parcial/desligada no `window`.
   *
   * `Object.defineProperty` em vez de atribuição: stubs parciais não satisfazem
   * as interfaces completas do DOM (`SpeechSynthesis`, `typeof AudioContext`) e
   * algumas dessas propriedades chegam como accessors de leitura.
   */
  function overrideGlobal(target: object, key: string, value?: unknown): void {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    localStorage.clear();

    Object.defineProperty(window, 'localStorage', {
      value: localStorage,
      configurable: true,
    });

    window.dispatchEvent = window.dispatchEvent.bind(window) || (() => true);

    if (!window.BroadcastChannel) {
      window.BroadcastChannel = BroadcastChannelStub;
    }

    overrideGlobal(globalThis, 'BroadcastChannel', window.BroadcastChannel);

    const locksStub = {
      request: (name: string, options: unknown, callback: () => unknown) => {
        const fn =
          typeof options === 'function' ? (options as () => unknown) : callback;
        return fn();
      },
    };

    try {
      if (!navigator.locks) {
        overrideGlobal(navigator, 'locks', locksStub);
      }
    } catch {
      overrideGlobal(navigator, 'locks', locksStub);
    }

    if (!('speechSynthesis' in window)) {
      overrideGlobal(window, 'speechSynthesis', {
        getVoices: () => [],
        speak: () => {},
        cancel: () => {},
        resume: () => {},
        speaking: false,
        pending: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    }

    overrideGlobal(window, 'AudioContext');
    overrideGlobal(window, 'webkitAudioContext');
  });

  overrideGlobal(globalThis, '__localStorage', localStorage);
} // end else (window defined)
