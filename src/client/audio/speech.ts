import type { CallType } from '@/shared/constants';

import {
  CALL_TYPES,
  LOCALE,
  TTS_BEEP_DURATION,
  TTS_BEEP_FREQ_HIGH,
  TTS_BEEP_FREQ_LOW,
  TTS_BEEP_OFFSET,
  TTS_DEDUP_WINDOW,
  TTS_GAIN,
  TTS_MAX_NUMBER,
  TTS_PITCH,
  TTS_POST_BEEP_BUFFER,
  TTS_PRE_SPEECH_PAUSE,
  TTS_RETRY_DELAY,
  TTS_SPEAK_DELAY,
  TTS_SPEECH_RATE,
  TTS_VOICE_TIMEOUT,
  TTS_VOLUME,
  TTS_WATCHDOG_INTERVAL,
} from '@/shared/constants';

const CHANNEL_NAME = 'saude-tts';
const MONITOR_HEARTBEAT_MS = 2000;

/** Número aceito pelas APIs públicas: o valor chega como número via SSE, mas
 * `Number()` no corpo já tolera string — deixar a porta aberta evita cast no
 * monitor. */
type SpeechNumber = number | string;

// ─── Estado do módulo ──────────────────────────────────────────────────────────
// Dois contadores de geração SEPARADOS para evitar que speakNow e speakWithAlert
// se cancelem mutuamente (principal causa de silêncio após "Som ativado.").
let simpleGeneration = 0; // usado por speakNow  (mensagens de sistema)
let alertGeneration = 0; // usado por speakWithAlert (chamadas de senha)

let simpleTimer = 0;
let resumeTimer = 0;
let voicesReady = false;
let channel: BroadcastChannel | null = null;
let isMonitorSpeaker = false;

let lastSpokenKey = '';
let lastSpokenAt = 0;

// No-op — dashboard não fala; monitor fala via SSE
export function announceQueueCall(
  _number: SpeechNumber,
  _type: CallType,
): void {}

// ─── Texto de fala ─────────────────────────────────────────────────────────────
export function buildSpeechText(number: SpeechNumber, type: CallType): string {
  const n = Number(number) || 0;
  const spoken = numberToPt(n);
  return type === CALL_TYPES.PREFERENCIAL || type === CALL_TYPES.PREFERENTIAL
    ? `Senha preferencial. ${spoken}.`
    : `Senha. ${spoken}.`;
}

// "Chamar novamente" — força repetição ignorando dedup
export function forceAnnounce(number: SpeechNumber, type: CallType): void {
  const text = buildSpeechText(number, type);
  const key = `${Number(number)}-${type}`;
  if (lastSpokenKey === key) {
    lastSpokenKey = '';
    lastSpokenAt = 0;
  }
  void speakWithAlert(text, key, true);
}

export function initSpeechClient(): void {
  getChannel();
  void waitForVoices();
}

export function isMonitorSpeakerActive(): boolean {
  return isMonitorSpeaker;
}

// Chamado pelo monitor a partir dos eventos SSE — único ponto de fala de senhas
export function monitorSpeak(number: SpeechNumber, type: CallType): void {
  const text = buildSpeechText(number, type);
  const key = `${Number(number)}-${type}`;
  // Disparo intencionalmente solto: a fala tem timers próprios e os testes
  // (e o monitor) avançam os timers em vez de aguardar a promise.
  void speakWithAlert(text, key);
}
// ─── Conversão numérica pt-BR ─────────────────────────────────────────────────
export function numberToPt(value: SpeechNumber): string {
  const n = Math.max(0, Math.min(TTS_MAX_NUMBER, Number(value) || 0));
  if (n === 0) return 'zero';
  if (n === 1000) return 'mil';

  const units = [
    '',
    'um',
    'dois',
    'três',
    'quatro',
    'cinco',
    'seis',
    'sete',
    'oito',
    'nove',
  ];
  const teens = [
    'dez',
    'onze',
    'doze',
    'treze',
    'quatorze',
    'quinze',
    'dezesseis',
    'dezessete',
    'dezoito',
    'dezenove',
  ];
  const tens = [
    '',
    '',
    'vinte',
    'trinta',
    'quarenta',
    'cinquenta',
    'sessenta',
    'setenta',
    'oitenta',
    'noventa',
  ];
  const hundreds = [
    '',
    'cento',
    'duzentos',
    'trezentos',
    'quatrocentos',
    'quinhentos',
    'seiscentos',
    'setecentos',
    'oitocentos',
    'novecentos',
  ];

  function underHundred(num: number): string {
    if (num < 10) return units[num];
    if (num < 20) return teens[num - 10];
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return unit ? `${tens[ten]} e ${units[unit]}` : tens[ten];
  }

  if (n < 100) return underHundred(n);
  if (n === 100) return 'cem';
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return rest
    ? `${hundreds[hundred]} e ${underHundred(rest)}`
    : hundreds[hundred];
}

export function registerMonitorSpeaker(): () => void {
  isMonitorSpeaker = true;
  const ch = getChannel();
  const ping = () => ch?.postMessage({ type: 'monitor-here' });
  ping();
  const timer = window.setInterval(ping, MONITOR_HEARTBEAT_MS);
  return () => {
    isMonitorSpeaker = false;
    window.clearInterval(timer);
  };
}

// Fala simples sem beep (mensagens de sistema)
export function speakText(text: string): void {
  speakNow(text);
}

export function unlockSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  void waitForVoices();
  window.speechSynthesis.resume();
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  u.rate = 2;
  window.speechSynthesis.speak(u);
}

// ─── Sinal de alerta via AudioContext ─────────────────────────────────────────
/** `webkitAudioContext` é o prefixo de engines antigas e não existe no lib.dom. */
type WindowWithWebkitAudio = Window & {
  readonly webkitAudioContext?: typeof AudioContext;
};

// ─── Cria e fala um utterance ─────────────────────────────────────────────────
function doSpeak(
  synth: SpeechSynthesis,
  text: string,
  onEnd: () => void,
): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LOCALE;
  u.rate = TTS_SPEECH_RATE;
  u.pitch = TTS_PITCH;
  u.volume = TTS_VOLUME;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    // Retry com novo utterance
    window.setTimeout(() => {
      const r = new SpeechSynthesisUtterance(text);
      r.lang = LOCALE;
      r.rate = TTS_SPEECH_RATE;
      r.pitch = TTS_PITCH;
      r.volume = TTS_VOLUME;
      const v = pickVoice();
      if (v) r.voice = v;
      r.onend = onEnd;
      synth.resume();
      synth.speak(r);
    }, TTS_RETRY_DELAY);
  };
  synth.speak(u);
}

// ─── API pública ───────────────────────────────────────────────────────────────

// ─── BroadcastChannel (ping de presença entre monitores) ──────────────────────
// Só publica: o ping que chega de outros monitores não muda nada em quem o
// recebe (o áudio é sempre local), então não há listener a registrar.
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined')
    return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

// ─── Voz pt-BR ────────────────────────────────────────────────────────────────
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices() || [];
  return (
    voices.find((v) => /pt-BR|pt_BR/i.test(v.lang)) ||
    voices.find((v) => /maria|francisca|google.*portugu/i.test(v.name)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('pt')) ||
    null
  );
}

function playAlertBeep(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      resolve();
      return;
    }

    try {
      const ctx = new AudioContextCtor();
      const beeps = [
        { dur: TTS_BEEP_DURATION, freq: TTS_BEEP_FREQ_LOW, start: 0 },
        {
          dur: TTS_BEEP_DURATION,
          freq: TTS_BEEP_FREQ_HIGH,
          start: TTS_BEEP_OFFSET,
        },
      ];
      let lastEnd = 0;
      for (const b of beeps) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = b.freq;
        const t0 = ctx.currentTime + b.start;
        const t1 = t0 + b.dur;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(TTS_GAIN, t0 + 0.02);
        gain.gain.setValueAtTime(TTS_GAIN, t1 - 0.04);
        gain.gain.linearRampToValueAtTime(0, t1);
        osc.start(t0);
        osc.stop(t1);
        lastEnd = t1;
      }
      window.setTimeout(
        resolve,
        (lastEnd - ctx.currentTime) * 1000 + TTS_POST_BEEP_BUFFER,
      );
    } catch {
      resolve();
    }
  });
}

// ─── speakNow — mensagens simples ("Som ativado." etc.) ──────────────────────
// Usa simpleGeneration — NÃO interfere com speakWithAlert.
function speakNow(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const gen = ++simpleGeneration;
  const synth = window.speechSynthesis;

  window.clearTimeout(simpleTimer);

  simpleTimer = window.setTimeout(() => {
    // IIFE com `void`: `setTimeout` exige retorno `void`, e a fala precisa
    // esperar as vozes ficarem prontas antes de falar.
    void (async () => {
      if (gen !== simpleGeneration) return;
      await waitForVoices();
      if (gen !== simpleGeneration) return;

      // Não cancela a síntese de alertGeneration — apenas fala por cima se necessário
      synth.resume();
      doSpeak(synth, text, () => {
        /* nada */
      });
    })();
  }, TTS_SPEAK_DELAY);
}

// ─── speakWithAlert — chamadas de senha (beep → pausa → fala) ────────────────
// Usa alertGeneration — NÃO interfere com speakNow.
async function speakWithAlert(
  text: string,
  key = '',
  force = false,
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  if (
    !force &&
    key &&
    key === lastSpokenKey &&
    Date.now() - lastSpokenAt < TTS_DEDUP_WINDOW
  )
    return;
  if (key) {
    lastSpokenKey = key;
    lastSpokenAt = Date.now();
  }

  const gen = ++alertGeneration;
  const synth = window.speechSynthesis;

  stopResumeWatch();

  // Cancela qualquer fala anterior de senha (não cancela mensagens simples)
  synth.resume();
  if (synth.speaking || synth.pending) synth.cancel();

  // 1. Beep de alerta
  await playAlertBeep();
  if (gen !== alertGeneration) return;

  // 2. Vozes carregadas?
  await waitForVoices();
  if (gen !== alertGeneration) return;

  // 3. Pausa antes de falar
  await new Promise<void>((r) => window.setTimeout(r, TTS_PRE_SPEECH_PAUSE));
  if (gen !== alertGeneration) return;

  synth.resume();
  doSpeak(synth, text, () => {
    if (gen === alertGeneration) stopResumeWatch();
  });
  startResumeWatch();
}

function startResumeWatch(): void {
  stopResumeWatch();
  resumeTimer = window.setInterval(() => {
    if (!window.speechSynthesis.speaking) {
      stopResumeWatch();
      return;
    }
    window.speechSynthesis.resume();
  }, TTS_WATCHDOG_INTERVAL);
}

// ─── Watchdog anti-pausa do Chrome ────────────────────────────────────────────
function stopResumeWatch(): void {
  if (resumeTimer) {
    window.clearInterval(resumeTimer);
    resumeTimer = 0;
  }
}

// ─── Inicialização de vozes ───────────────────────────────────────────────────
function waitForVoices(): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    return Promise.resolve();
  const voices = window.speechSynthesis.getVoices();
  if (voices.length || voicesReady) {
    voicesReady = true;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const done = () => {
      voicesReady = true;
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done, {
      once: true,
    });
    window.setTimeout(done, TTS_VOICE_TIMEOUT);
  });
}
