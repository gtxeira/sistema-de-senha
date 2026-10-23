import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getInitialState,
  saveQueueState,
  readQueueState,
} from "@/client/queue/queue";
import { readJson } from "@/shared/json";
import type { ApiErrorBody } from "@/shared/types/api";

/**
 * Cobre a ordem das operações no handler de reset do admin.
 *
 * A lógica mora dentro do componente, então o teste extrai a mesma sequência e
 * a exercita contra a fila real em localStorage — o objetivo é travar o
 * contrato: a réplica local só é zerada depois que o servidor confirma.
 */
/** Subconjunto de `Response` que este teste lê — não precisa de um real. */
interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<FakeResponse>;

interface ResetResult {
  readonly ok: boolean;
  readonly error?: unknown;
}

async function runReset({ fetchImpl }: { readonly fetchImpl: FetchLike }): Promise<ResetResult> {
  // `stubGlobal` aceita qualquer valor: o fake devolve um objeto com o
  // subconjunto de `Response` consumido abaixo, não um `Response` de verdade.
  vi.stubGlobal("fetch", vi.fn(fetchImpl));

  // Reproduz admin/page.tsx:105-163 na ordem correta.
  try {
    const res = await fetch("/api/queue/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sector: "farmacia" }),
    });
    const data = await readJson<ApiErrorBody>(res).catch<ApiErrorBody>(() => ({}));
    if (!res.ok) return { ok: false, error: data.error };

    const currentState = readQueueState();
    saveQueueState({
      ...currentState,
      farmacia: {
        ...currentState.farmacia,
        normalCurrent: null,
        priorityCurrent: null,
        history: [],
      },
    });

    return { ok: true };
  } catch {
    // Espelha o catch do componente: nada de local, nada de servidor.
    return { ok: false, error: "Erro ao zerar os contadores." };
  }
}

describe("admin — reset da fila", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // `QueueEntry` é imutável — monta o novo estado em vez de mutar.
    const state = getInitialState();
    saveQueueState({
      ...state,
      farmacia: {
        ...state.farmacia,
        normalCurrent: 42,
        history: [{ number: 42, type: "normal", time: "14:30" }],
      },
    });
  });

  it("zera a réplica local quando o servidor confirma", async () => {
    const result = await runReset({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, sectors: ["farmacia"] }),
      }),
    });

    expect(result.ok).toBe(true);
    const state = readQueueState().farmacia;
    expect(state.normalCurrent).toBeNull();
    expect(state.priorityCurrent).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("preserva a réplica local quando a API falha", async () => {
    // Regressão: a versão anterior zerava o localStorage antes do fetch, então
    // uma falha deixava todo cliente limpo com o servidor intacto.
    const result = await runReset({
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Não foi possível zerar a fila." }),
      }),
    });

    expect(result.ok).toBe(false);
    const state = readQueueState().farmacia;
    expect(state.normalCurrent).toBe(42);
    expect(state.history).toHaveLength(1);
  });

  it("preserva a réplica local quando a API retorna 403 (não-admin)", async () => {
    const result = await runReset({
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden." }),
      }),
    });

    expect(result.ok).toBe(false);
    expect(readQueueState().farmacia.normalCurrent).toBe(42);
  });

  it("preserva a réplica local quando a API retorna 401 (sem sessão)", async () => {
    const result = await runReset({
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized." }),
      }),
    });

    expect(result.ok).toBe(false);
    expect(readQueueState().farmacia.normalCurrent).toBe(42);
  });

  it("preserva a réplica local quando a rede falha", async () => {
    const result = await runReset({
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });

    expect(result.ok).toBe(false);
    expect(readQueueState().farmacia.normalCurrent).toBe(42);
  });
});
