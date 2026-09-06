import { describe, it, expect } from "vitest";
import { formatQueueNumber } from "@/lib/prisma";

describe("prisma#formatQueueNumber", () => {
  it("retorna '---' para valores vazios ou <= 0", () => {
    expect(formatQueueNumber(0)).toBe("---");
    expect(formatQueueNumber(-1)).toBe("---");
    expect(formatQueueNumber(null)).toBe("---");
    expect(formatQueueNumber(undefined)).toBe("---");
    expect(formatQueueNumber(NaN)).toBe("---");
  });

  it("retorna '999' para valores >= 1000", () => {
    expect(formatQueueNumber(1000)).toBe("999");
    expect(formatQueueNumber(2500)).toBe("999");
  });

  it("preenche com zeros à esquerda até 3 dígitos", () => {
    expect(formatQueueNumber(1)).toBe("001");
    expect(formatQueueNumber(42)).toBe("042");
    expect(formatQueueNumber(999)).toBe("999");
  });
});