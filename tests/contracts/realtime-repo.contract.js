import { describe, it, expect, vi } from "vitest";

/**
 * RealtimeRepository contract — shared test suite.
 * Pass a factory that returns { repo, emit }.
 * emit simulates a database INSERT event for testing.
 */
export function realtimeRepoContract(createRepo) {
  describe("RealtimeRepository contract", () => {
    let repo;
    let emit;

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      emit = ctx.emit;
    });

    describe("subscribeToQueue()", () => {
      it("retorna uma função de unsubscribe", () => {
        const unsub = repo.subscribeToQueue("farmacia", () => {});
        expect(typeof unsub).toBe("function");
        unsub();
      });

      it("chama callback com formato correto ao receber evento", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("farmacia", callback);

        await emit("farmacia", {
          id: "test-id",
          number_int: 42,
          type: "normal",
          created_at: new Date().toISOString(),
        });

        expect(callback).toHaveBeenCalledOnce();
        const call = callback.mock.calls[0][0];
        expect(call).toHaveProperty("id");
        expect(call).toHaveProperty("number", 42);
        expect(call).toHaveProperty("type");
        expect(call).toHaveProperty("time");
        expect(typeof call.time).toBe("string");

        unsub();
      });

      it("normaliza tipo 'preferential' para 'preferencial'", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("farmacia", callback);

        await emit("farmacia", {
          id: "pref-id",
          number_int: 7,
          type: "preferential",
          created_at: new Date().toISOString(),
        });

        expect(callback).toHaveBeenCalledOnce();
        expect(callback.mock.calls[0][0].type).toBe("preferencial");

        unsub();
      });

      it("normaliza tipo 'preferencial' para 'preferencial'", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("recepcao", callback);

        await emit("recepcao", {
          id: "pref2-id",
          number_int: 3,
          type: "preferencial",
          created_at: new Date().toISOString(),
        });

        expect(callback).toHaveBeenCalledOnce();
        expect(callback.mock.calls[0][0].type).toBe("preferencial");

        unsub();
      });

      it("ignora eventos de outros setores", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("farmacia", callback);

        await emit("recepcao", {
          id: "other-id",
          number_int: 1,
          type: "normal",
          created_at: new Date().toISOString(),
        });

        expect(callback).not.toHaveBeenCalled();
        unsub();
      });

      it("não chama callback se number_int não existe", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("farmacia", callback);

        await emit("farmacia", {
          id: "no-number",
          type: "normal",
          created_at: new Date().toISOString(),
        });

        expect(callback).not.toHaveBeenCalled();
        unsub();
      });

      it("após unsubscribe, não chama mais callback", async () => {
        const callback = vi.fn();
        const unsub = repo.subscribeToQueue("farmacia", callback);

        unsub();

        await emit("farmacia", {
          id: "after-unsub",
          number_int: 1,
          type: "normal",
          created_at: new Date().toISOString(),
        });

        expect(callback).not.toHaveBeenCalled();
      });
    });
  });
}
