import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const painelPath = resolve(__dirname, "../../../src/app/painel/page.js");
const painelCode = readFileSync(painelPath, "utf-8");

describe("Painel page — audio isolation", () => {
  it("não importa funções de áudio de speech.js", () => {
    expect(painelCode).not.toMatch(/from.*speech/);
    expect(painelCode).not.toMatch(/import.*\b(forceAnnounce|monitorSpeak|speakText|unlockSpeech|initSpeechClient)\b/);
  });

  it("não chama forceAnnounce", () => {
    expect(painelCode).not.toMatch(/forceAnnounce\s*\(/);
  });

  it("não inicializa speechSynthesis", () => {
    expect(painelCode).not.toMatch(/initSpeechClient\s*\(/);
    expect(painelCode).not.toMatch(/unlockSpeech\s*\(/);
  });

  it("não possui estado audioEnabled", () => {
    expect(painelCode).not.toMatch(/audioEnabled/);
  });

  it("reCall chama endpoint /api/queue/recall em vez de tocar áudio local", () => {
    expect(painelCode).toMatch(/\/api\/queue\/recall/);
    expect(painelCode).not.toMatch(/forceAnnounce.*reCall|reCall.*forceAnnounce/);
  });
});
