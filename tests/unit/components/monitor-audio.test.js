import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const monitorPath = resolve(__dirname, "../../../src/app/monitor/[sector]/page.js");
const monitorCode = readFileSync(monitorPath, "utf-8");

describe("Monitor page — audio on SSE events", () => {
  it("chama monitorSpeak ao receber lastCall sem condicionar a audioEnabled", () => {
    const lastCallEffect = monitorCode.match(
      /useEffect\(\(\) => \{[\s\S]*?lastCall[\s\S]*?\}, \[lastCall/,
    );
    expect(lastCallEffect).toBeTruthy();

    expect(lastCallEffect[0]).toMatch(/monitorSpeak\(lastCall\.number/);
    expect(lastCallEffect[0]).not.toMatch(/audioEnabled.*monitorSpeak|monitorSpeak.*audioEnabled/);
  });

  it("não possui gate audioEnabledRef antes de monitorSpeak", () => {
    expect(monitorCode).not.toMatch(/if\s*\(\s*audioEnabledRef\.current\s*\)\s*\{?\s*\n?\s*monitorSpeak/);
  });

  it("ainda possui机制 de unlock para beep (AudioContext)", () => {
    expect(monitorCode).toMatch(/unlockSpeech/);
    expect(monitorCode).toMatch(/audioEnabled/);
  });

  it("importa monitorSpeak de speech.js", () => {
    expect(monitorCode).toMatch(/monitorSpeak/);
    expect(monitorCode).toMatch(/from.*speech/);
  });

  it("pula dedup de lastSpokenCallId quando isRecall é true", () => {
    expect(monitorCode).toMatch(/isRecall/);
    expect(monitorCode).toMatch(/!isRecall\s*&&\s*lastSpokenCallId\s*===\s*callKey/);
  });

  it("chamadas normais são deduplicadas por lastSpokenCallId", () => {
    expect(monitorCode).toMatch(/lastSpokenCallId\s*===\s*callKey/);
  });

  it("callNext do monitor usa forceAnnounce", () => {
    const callNextSection = monitorCode.substring(
      monitorCode.indexOf("const callNext"),
      monitorCode.indexOf("/* ─── repetir"),
    );
    expect(callNextSection).toMatch(/forceAnnounce/);
  });

  it("reCall do monitor usa forceAnnounce", () => {
    const reCallSection = monitorCode.substring(
      monitorCode.indexOf("const reCall"),
      monitorCode.indexOf("/* ─── atalhos de teclado"),
    );
    expect(reCallSection).toMatch(/forceAnnounce/);
  });

  it("importa forceAnnounce de speech.js", () => {
    expect(monitorCode).toMatch(/forceAnnounce/);
  });
});
