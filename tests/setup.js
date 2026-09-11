import { beforeEach, vi } from "vitest";

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