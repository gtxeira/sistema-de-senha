import { describe, expect, it } from "vitest";
import { numberToPt, buildSpeechText } from "@/lib/speech";

describe("numberToPt", () => {
  it("converte zero e mil", () => {
    expect(numberToPt(0)).toBe("zero");
    expect(numberToPt(1000)).toBe("mil");
  });

  it("converte unidades e dezenas", () => {
    expect(numberToPt(1)).toBe("um");
    expect(numberToPt(7)).toBe("sete");
    expect(numberToPt(10)).toBe("dez");
    expect(numberToPt(15)).toBe("quinze");
    expect(numberToPt(25)).toBe("vinte e cinco");
    expect(numberToPt(90)).toBe("noventa");
  });

  it("converte centenas", () => {
    expect(numberToPt(100)).toBe("cem");
    expect(numberToPt(105)).toBe("cento e cinco");
    expect(numberToPt(200)).toBe("duzentos");
    expect(numberToPt(250)).toBe("duzentos e cinquenta");
    expect(numberToPt(999)).toBe("novecentos e noventa e nove");
  });

  it("limita o intervalo entre 0 e 1000", () => {
    expect(numberToPt(-5)).toBe("zero");
    expect(numberToPt(1500)).toBe("mil");
  });
});

describe("buildSpeechText", () => {
  it("monta texto para senha normal", () => {
    expect(buildSpeechText(12, "normal")).toBe("Senha. doze.");
  });

  it("monta texto para senha preferencial", () => {
    expect(buildSpeechText(3, "preferencial")).toBe("Senha preferencial. três.");
    expect(buildSpeechText(3, "preferential")).toBe("Senha preferencial. três.");
  });
});