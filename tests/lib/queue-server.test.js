import { describe, expect, it, vi } from "vitest";

let isAdminConfigured = false;
let adminClient = null;
let isConfigured = false;
let anonClient = null;

vi.mock("@/lib/supabase-admin", () => ({
  get isSupabaseAdminConfigured() {
    return isAdminConfigured;
  },
  get supabaseAdmin() {
    return adminClient;
  },
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return isConfigured;
  },
  get supabase() {
    return anonClient;
  },
}));

import {
  isInvalidApiKeyError,
  normalizeCallType,
  formatNumberString,
  nextQueueNumberForSector,
  insertQueueCall,
  resetSectorSequence,
  getQueueDb,
  getQueueDbClients,
} from "@/lib/queue-server";

describe("isInvalidApiKeyError", () => {
  it("detecta mensagem de chave inválida", () => {
    expect(isInvalidApiKeyError({ message: "invalid api key" })).toBe(true);
    expect(isInvalidApiKeyError(new Error("Invalid API Key"))).toBe(true);
    expect(isInvalidApiKeyError("invalid api key")).toBe(true);
  });

  it("retorna false para outros erros", () => {
    expect(isInvalidApiKeyError({ message: "outra coisa" })).toBe(false);
    expect(isInvalidApiKeyError(null)).toBe(false);
  });
});

describe("normalizeCallType", () => {
  it("normaliza preferencial/preferential", () => {
    expect(normalizeCallType("preferencial")).toEqual({
      sequenceType: "preferencial",
      callType: "preferential",
    });
    expect(normalizeCallType("preferential")).toEqual({
      sequenceType: "preferencial",
      callType: "preferential",
    });
  });

  it("trata qualquer outro valor como normal", () => {
    expect(normalizeCallType("normal")).toEqual({
      sequenceType: "normal",
      callType: "normal",
    });
    expect(normalizeCallType(undefined)).toEqual({
      sequenceType: "normal",
      callType: "normal",
    });
  });
});

describe("formatNumberString", () => {
  it("prefixa N/P e formata", () => {
    expect(formatNumberString(1, "normal")).toBe("N001");
    expect(formatNumberString(2, "preferencial")).toBe("P002");
  });

  it("retorna '1000' sem prefixo quando >= 1000", () => {
    expect(formatNumberString(1000, "normal")).toBe("1000");
  });
});

describe("nextQueueNumberForSector", () => {
  it("usa RPC quando disponível", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: { number: 42 }, error: null }) };
    const n = await nextQueueNumberForSector(db, "farmacia", "normal");
    expect(n).toBe(42);
    expect(db.rpc).toHaveBeenCalledWith("call_queue", {
      p_sector_id: "farmacia",
      p_call_type: "normal",
    });
  });

  it("fallback para incrementCurrentNumber quando RPC falha", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: {} }),
      from: vi.fn(),
    };
    const seq = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn(),
    };
    seq.select.mockReturnValue(seq);
    seq.eq.mockReturnValue(seq);
    seq.limit.mockReturnValue(seq);
    seq.maybeSingle.mockResolvedValue({
      data: { current_number: 5 },
      error: null,
    });
    seq.update.mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });
    db.from.mockReturnValue(seq);

    const n = await nextQueueNumberForSector(db, "farmacia", "normal");
    expect(n).toBe(6);
  });

  it("insere registro 1 quando não há sequência", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }), from: vi.fn() };
    const seq = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      insert: vi.fn(),
    };
    seq.select.mockReturnValue(seq);
    seq.eq.mockReturnValue(seq);
    seq.maybeSingle.mockResolvedValue({ data: null, error: null });
    seq.insert.mockResolvedValue({ error: null });
    db.from.mockReturnValue(seq);

    const n = await nextQueueNumberForSector(db, "farmacia", "preferencial");
    expect(n).toBe(1);
    expect(seq.insert).toHaveBeenCalledWith({
      sector_id: "farmacia",
      call_type: "preferencial",
      current_number: 1,
    });
  });
});

describe("insertQueueCall", () => {
  it("usa called_by quando é UUID válido", async () => {
    const db = { from: vi.fn() };
    const insert = vi.fn().mockResolvedValue({ error: null });
    db.from.mockReturnValue({ insert });

    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    await insertQueueCall(db, {
      sector: "farmacia",
      nextNum: 3,
      numberStr: "N003",
      sequenceType: "normal",
      callType: "normal",
      attendantId: uuid,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sector_id: "farmacia",
        type: "normal",
        number_int: 3,
        number_str: "N003",
        called_by: uuid,
      }),
    );
  });

  it("usa null para called_by quando não é UUID", async () => {
    const db = { from: vi.fn() };
    const insert = vi.fn().mockResolvedValue({ error: null });
    db.from.mockReturnValue({ insert });

    await insertQueueCall(db, {
      sector: "farmacia",
      nextNum: 3,
      numberStr: "N003",
      sequenceType: "normal",
      callType: "normal",
      attendantId: "não-uuid",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ called_by: null }),
    );
  });

  it("fallback para call_type/attendant_id quando primeira falha", async () => {
    const db = { from: vi.fn() };
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "coluna inexistente" } })
      .mockResolvedValueOnce({ error: null });
    db.from.mockReturnValue({ insert });

    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    await insertQueueCall(db, {
      sector: "farmacia",
      nextNum: 1,
      numberStr: "N001",
      sequenceType: "normal",
      callType: "normal",
      attendantId: uuid,
    });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        call_type: "normal",
        attendant_id: uuid,
      }),
    );
  });
});

describe("resetSectorSequence", () => {
  it("atualiza current_number", async () => {
    const db = { from: vi.fn() };
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    db.from.mockReturnValue({ update });

    await resetSectorSequence(db, "farmacia");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ current_number: 0 }),
    );
  });
});

describe("getQueueDb / getQueueDbClients", () => {
  it("retorna null quando sem clientes configurados", () => {
    isAdminConfigured = false;
    isConfigured = false;
    adminClient = null;
    anonClient = null;
    expect(getQueueDb()).toBeNull();
    expect(getQueueDbClients()).toEqual([]);
  });

  it("retorna supabaseAdmin quando configurado", () => {
    isAdminConfigured = true;
    isConfigured = false;
    adminClient = { __admin: 1 };
    anonClient = null;
    expect(getQueueDb()).toEqual({ __admin: 1 });
    expect(getQueueDbClients()).toEqual([{ __admin: 1 }]);
  });

  it("retorna supabase quando só anon configurado", () => {
    isAdminConfigured = false;
    isConfigured = true;
    adminClient = null;
    anonClient = { __anon: 1 };
    expect(getQueueDb()).toEqual({ __anon: 1 });
    expect(getQueueDbClients()).toEqual([{ __anon: 1 }]);
  });

  it("inclui admin e supabase quando ambos e diferentes", () => {
    isAdminConfigured = true;
    isConfigured = true;
    adminClient = { __admin: 1 };
    anonClient = { __anon: 1 };
    expect(getQueueDbClients()).toEqual([{ __admin: 1 }, { __anon: 1 }]);
  });

  it("não duplica quando supabase é o mesmo que admin", () => {
    isAdminConfigured = true;
    isConfigured = true;
    adminClient = { __same: 1 };
    anonClient = adminClient;
    expect(getQueueDbClients()).toEqual([{ __same: 1 }]);
  });
});

describe("incrementViaRpc (via nextQueueNumberForSector)", () => {
  it("aceita data escalar (número simples)", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: 7, error: null }) };
    expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(7);
  });

  it("aceita campos alternativos do resultado", async () => {
    for (const field of ["queue_number", "current_number", "next_number"]) {
      const db = {
        rpc: vi.fn().mockResolvedValue({ data: { [field]: 11 }, error: null }),
      };
      expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(11);
    }
  });

  function makeDbWithCurrent() {
    // incrementCurrentNumber: encontra linha e atualiza (com dois .eq no update)
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue({ data: { current_number: 3 }, error: null });
    chain.update.mockReturnValue({
      eq: vi.fn(),
    });
    // update().eq().eq() — o último eq resolve
    const updateEq = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    updateEq.eq.mockReturnValue(updateEq);
    chain.update.mockReturnValue({ eq: vi.fn().mockReturnValue(updateEq) });
    const from = vi.fn().mockReturnValue(chain);
    return {
      rpc: vi.fn().mockResolvedValue({ data: null, error: {} }),
      from,
    };
  }

  it("usa fallback quando RPC falha (incrementCurrentNumber atualiza)", async () => {
    const db = makeDbWithCurrent();
    expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(4);
    expect(db.rpc).toHaveBeenCalled();
    expect(db.from).toHaveBeenCalled();
  });

  it("usa fallback quando RPC retorna número inválido", async () => {
    const db = makeDbWithCurrent();
    db.rpc = vi.fn().mockResolvedValue({ data: { number: 0 }, error: null });
    expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(4);
  });
});

// Cadeia select().eq().eq().maybeSingle() pronto para rejeitar/resolver
function makeMaybeSingleChain(resolution) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockImplementation(() =>
    typeof resolution === "function" ? resolution() : Promise.resolve(resolution),
  );
  return chain;
}

// Cadeia select().eq().limit() do incrementLegacyColumns
function makeLegacyChain(selectResolve, updateResolve) {
  const legacy = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  };
  legacy.select.mockReturnValue(legacy);
  legacy.eq.mockReturnValue(legacy);
  legacy.limit.mockResolvedValue(selectResolve);
  const update = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(updateResolve),
    }),
  };
  return { legacy, update };
}

describe("nextQueueNumberForSector (fallback legacy)", () => {
  it("usa legacy quando current_number lança erro não-column", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) };
    const from = vi.fn();

    // 1ª chamada: incrementCurrentNumber → maybeSingle lança erro não-column
    const currentChain = makeMaybeSingleChain(async () => {
      throw new Error("boom");
    });
    // 2ª chamada: incrementLegacyColumns select("*").limit(1) → row com campo
    const { legacy, update } = makeLegacyChain(
      { data: [{ normal_current: 4 }], error: null },
      { error: null },
    );

    from.mockReturnValueOnce(currentChain);
    from.mockReturnValueOnce(legacy);
    from.mockReturnValueOnce(update);
    db.from = from;

    expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(5);
  });

  it("repropaga o erro quando legacy não encontra o campo", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) };
    const from = vi.fn();

    const currentChain = makeMaybeSingleChain(async () => {
      throw new Error("boom");
    });
    // legacy retorna rows sem o campo → retorna null → re-throw do erro original
    const { legacy } = makeLegacyChain(
      { data: [{}], error: null },
      { error: null },
    );

    from.mockReturnValueOnce(currentChain);
    from.mockReturnValueOnce(legacy);
    db.from = from;

    await expect(
      nextQueueNumberForSector(db, "recepcao", "normal"),
    ).rejects.toThrow("boom");
  });

  it("repropaga erro não-column do incrementCurrentNumber", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) };
    const from = vi.fn();

    // incrementCurrentNumber: maybeSingle resolve error sem "column" → throw
    const currentChain = makeMaybeSingleChain({
      data: null,
      error: { message: "network error" },
    });
    // legacy: também não encontra campo → re-throw do erro original
    const { legacy } = makeLegacyChain(
      { data: [{}], error: null },
      { error: null },
    );

    from.mockReturnValueOnce(currentChain);
    from.mockReturnValueOnce(legacy);
    db.from = from;

    await expect(
      nextQueueNumberForSector(db, "farmacia", "normal"),
    ).rejects.toThrow("network error");
  });

  it("usa insert quando não há linha de sequência", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) };
    const from = vi.fn();

    // incrementCurrentNumber: maybeSingle resolve sem current_number
    const currentChain = makeMaybeSingleChain({ data: {}, error: null });
    const insertObj = { insert: vi.fn().mockResolvedValue({ error: null }) };

    from.mockReturnValueOnce(currentChain);
    from.mockReturnValueOnce(insertObj);
    db.from = from;

    expect(await nextQueueNumberForSector(db, "farmacia", "normal")).toBe(1);
    expect(insertObj.insert).toHaveBeenCalledWith({
      sector_id: "farmacia",
      call_type: "normal",
      current_number: 1,
    });
  });
});

describe("resetSectorSequence (fallback e erro)", () => {
  it("faz fallback para colunas legacy quando current_number falha", async () => {
    const db = { from: vi.fn() };
    const update = vi
      .fn()
      .mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: {} }) })
      .mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: null }) });
    db.from.mockReturnValue({ update });

    await resetSectorSequence(db, "farmacia");
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0]).toEqual(
      expect.objectContaining({ normal_current: 0, priority_current: 0 }),
    );
  });

  it("lança erro quando ambos os resets falham", async () => {
    const db = { from: vi.fn() };
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "falhou" } }),
    });
    db.from.mockReturnValue({ update });

    await expect(resetSectorSequence(db, "farmacia")).rejects.toEqual(
      { message: "falhou" },
    );
  });
});

describe("insertQueueCall (isUuid)", () => {
  it("trata UUID com versão inválida como null", async () => {
    const db = { from: vi.fn() };
    const insert = vi.fn().mockResolvedValue({ error: null });
    db.from.mockReturnValue({ insert });

    // versão "0000" é inválida pelo regex [1-8]
    const invalidUuid = "123e4567-e89b-0000-a000-000000000000";
    await insertQueueCall(db, {
      sector: "farmacia",
      nextNum: 3,
      numberStr: "N003",
      sequenceType: "normal",
      callType: "normal",
      attendantId: invalidUuid,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ called_by: null }),
    );
  });
});