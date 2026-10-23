import { describe, expect, it } from "vitest";
import { isInvalidApiKeyError } from "@/shared/errors";
import {
  formatNumberString,
  normalizeCallType,
} from "@/shared/queue-format";

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
    expect(formatNumberString(1000, "preferencial")).toBe("1000");
  });
});
