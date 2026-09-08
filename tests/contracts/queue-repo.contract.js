import { describe, it, expect } from "vitest";

/**
 * QueueRepository contract — shared test suite.
 * Pass a factory that returns a fresh repository instance (optionally async).
 * The factory should clean any persisted state between calls.
 */
export function queueRepoContract(createRepo) {
  describe("QueueRepository contract", () => {
    let repo;

    beforeEach(async () => {
      repo = await createRepo();
    });

    describe("nextNumber()", () => {
      it("retorna um número inteiro ≥ 1 para farmácia normal", async () => {
        const num = await repo.nextNumber("farmacia", "normal");
        expect(Number.isInteger(num)).toBe(true);
        expect(num).toBeGreaterThanOrEqual(1);
      });

      it("retorna um número inteiro ≥ 1 para recepção preferencial", async () => {
        const num = await repo.nextNumber("recepcao", "preferencial");
        expect(Number.isInteger(num)).toBe(true);
        expect(num).toBeGreaterThanOrEqual(1);
      });

      it("incrementa sequencialmente para o mesmo setor+tipo", async () => {
        const n1 = await repo.nextNumber("farmacia", "normal");
        const n2 = await repo.nextNumber("farmacia", "normal");
        const n3 = await repo.nextNumber("farmacia", "normal");
        expect(n2).toBe(n1 + 1);
        expect(n3).toBe(n2 + 1);
      });

      it("mantém sequências independentes por tipo", async () => {
        const n1 = await repo.nextNumber("farmacia", "normal");
        const n2 = await repo.nextNumber("farmacia", "preferencial");
        expect(n1).toBe(1);
        expect(n2).toBe(1);
        const n3 = await repo.nextNumber("farmacia", "normal");
        expect(n3).toBe(n1 + 1);
      });

      it("mantém sequências independentes por setor", async () => {
        const n1 = await repo.nextNumber("farmacia", "normal");
        const n2 = await repo.nextNumber("recepcao", "normal");
        expect(n1).toBe(1);
        expect(n2).toBe(1);
        const n3 = await repo.nextNumber("farmacia", "normal");
        expect(n3).toBe(n1 + 1);
      });
    });

    describe("saveCall()", () => {
      it("salva uma chamada sem erro", async () => {
        const num = await repo.nextNumber("farmacia", "normal");
        await expect(
          repo.saveCall({
            sector: "farmacia",
            number: num,
            numberStr: `N${String(num).padStart(3, "0")}`,
            sequenceType: "normal",
            callType: "normal",
            attendantId: null,
          }),
        ).resolves.toBeUndefined();
      });

      it("aceita attendantId null", async () => {
        const num = await repo.nextNumber("farmacia", "preferencial");
        await expect(
          repo.saveCall({
            sector: "farmacia",
            number: num,
            numberStr: `P${String(num).padStart(3, "0")}`,
            sequenceType: "preferencial",
            callType: "preferencial",
            attendantId: null,
          }),
        ).resolves.toBeUndefined();
      });

      it("aceita attendantId com valor", async () => {
        const num = await repo.nextNumber("recepcao", "normal");
        await expect(
          repo.saveCall({
            sector: "recepcao",
            number: num,
            numberStr: `N${String(num).padStart(3, "0")}`,
            sequenceType: "normal",
            callType: "normal",
            attendantId: "some-uuid",
          }),
        ).resolves.toBeUndefined();
      });
    });

    describe("resetSector()", () => {
      it("reseta a sequência para 1", async () => {
        await repo.nextNumber("farmacia", "normal");
        await repo.nextNumber("farmacia", "normal");
        await repo.resetSector("farmacia");
        const num = await repo.nextNumber("farmacia", "normal");
        expect(num).toBe(1);
      });

      it("reseta apenas o setor informado", async () => {
        await repo.nextNumber("farmacia", "normal");
        await repo.nextNumber("farmacia", "normal");
        await repo.nextNumber("recepcao", "normal");
        await repo.nextNumber("recepcao", "normal");

        await repo.resetSector("farmacia");

        const f = await repo.nextNumber("farmacia", "normal");
        const r = await repo.nextNumber("recepcao", "normal");
        expect(f).toBe(1);
        expect(r).toBeGreaterThan(1);
      });

      it("reseta ambos os tipos do setor", async () => {
        await repo.nextNumber("farmacia", "normal");
        await repo.nextNumber("farmacia", "preferencial");
        await repo.resetSector("farmacia");
        const n = await repo.nextNumber("farmacia", "normal");
        const p = await repo.nextNumber("farmacia", "preferencial");
        expect(n).toBe(1);
        expect(p).toBe(1);
      });
    });
  });
}
