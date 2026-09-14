import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { numberToPt, buildSpeechText, monitorSpeak, forceAnnounce, initSpeechClient, announceQueueCall } from "@/lib/speech";

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.SpeechSynthesisUtterance;
});

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

describe("monitorSpeak", () => {
  it("fala o texto da senha via speechSynthesis", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const promise = monitorSpeak(42, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(speakSpy).toHaveBeenCalled();
    const utterance = speakSpy.mock.calls[0][0];
    expect(utterance.text).toBe("Senha. quarenta e dois.");
    expect(utterance.lang).toBe("pt-BR");
  });

  it("fala texto preferencial corretamente", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const promise = monitorSpeak(5, "preferencial");
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(speakSpy).toHaveBeenCalled();
    const utterance = speakSpy.mock.calls[0][0];
    expect(utterance.text).toBe("Senha preferencial. cinco.");
  });
});

describe("forceAnnounce", () => {
  it("força fala ignorando dedup", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const p1 = forceAnnounce(10, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p1;

    const p2 = forceAnnounce(10, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p2;

    expect(speakSpy).toHaveBeenCalledTimes(2);
  });

  it("limpa estado de dedup para que forceAnnounce repita imediatamente", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const p1 = monitorSpeak(7, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p1;

    const p2 = monitorSpeak(7, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p2;

    expect(speakSpy).toHaveBeenCalledTimes(1);

    forceAnnounce(7, "normal");
    await vi.advanceTimersByTimeAsync(3000);

    expect(speakSpy).toHaveBeenCalledTimes(2);
  });
});

describe("monitorSpeak dedup", () => {
  it("deduplica mesma chave dentro da janela de 10s", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const p1 = monitorSpeak(42, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p1;

    const p2 = monitorSpeak(42, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p2;

    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("não deduplica chaves diferentes", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const p1 = monitorSpeak(1, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p1;

    const p2 = monitorSpeak(2, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p2;

    expect(speakSpy).toHaveBeenCalledTimes(2);
  });

  it("não deduplica mesmo número com tipos diferentes", async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    const p1 = monitorSpeak(5, "normal");
    await vi.advanceTimersByTimeAsync(3000);
    await p1;

    const p2 = monitorSpeak(5, "preferencial");
    await vi.advanceTimersByTimeAsync(3000);
    await p2;

    expect(speakSpy).toHaveBeenCalledTimes(2);
  });
});

describe("announceQueueCall", () => {
  it("é no-op — não fala nada", () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, "speak");
    initSpeechClient();

    announceQueueCall(42, "normal");

    expect(speakSpy).not.toHaveBeenCalled();
  });
});