"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  memo,
} from "react";
import { Clock3 } from "lucide-react";
import {
  formatQueueNumber,
  getQueueSnapshot,
  nextQueueNumber,
  normalizeQueue,
  readQueueState,
  saveQueueState,
  SECTORS,
  subscribeQueue,
  withQueueLock,
} from "../../../lib/queue";
import { isSupabaseConfigured, getRealtimeClient } from "../../../lib/supabase";
import {
  forceAnnounce,
  monitorSpeak,
  registerMonitorSpeaker,
  speakText,
  unlockSpeech,
} from "../../../lib/speech";
import styles from "./Monitor.module.css";

/* ─── notícias ─── */
let newsSnapshot = [];
const serverNewsSnapshot = [];
const monitorServerSnapshot = {
  farmacia: { normalCurrent: 0, priorityCurrent: 0, history: [] },
  recepcao: { normalCurrent: 0, priorityCurrent: 0, history: [] },
};
let lastSpokenCallId = null;

function getNewsSnapshot() {
  if (typeof window === "undefined") return serverNewsSnapshot;
  return newsSnapshot;
}
function subscribeNews(cb) {
  window.addEventListener("storage", cb);
  window.addEventListener("news-updated", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("news-updated", cb);
  };
}

function formatMonitorNumber(number) {
  return String(Number(number) || 0).padStart(3, "0");
}

function cleanHistory(history = []) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  return history.filter((item) => {
    if (!item?.number) return false;
    // Deduplica por número+tipo (ignora id pois itens locais não têm id ainda)
    const key = `${item.number}-${item.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ─── carrossel de notícias isolado (evita re-render da voz) ─── */
const NewsCarousel = memo(function NewsCarousel() {
  const news = useSyncExternalStore(
    subscribeNews,
    getNewsSnapshot,
    () => serverNewsSnapshot,
  );
  const [newsIndex, setNewsIndex] = useState(0);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.news?.length) return;
        newsSnapshot = data.news;
        window.dispatchEvent(new Event("news-updated"));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!news?.length) return;
    const t = setInterval(
      () => setNewsIndex((p) => (p + 1) % news.length),
      5000,
    );
    return () => clearInterval(t);
  }, [news]);

  if (!news?.length) {
    return (
      <div className={styles.emptyNews}>
        <strong>INFORMAÇÕES DA UNIDADE</strong>
      </div>
    );
  }

  const item = news[newsIndex];
  return (
    <>
      {item?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt={item.title || ""}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      <div className={styles.newsCaption}>
        <div className={styles.dots}>
          {news.map((_, i) => (
            <i key={i} className={i === newsIndex ? styles.activeDot : ""} />
          ))}
        </div>
      </div>
    </>
  );
});

/* ══════════════════════════════════════════════
   MONITOR — tela pública de senhas
   Controle via atalhos de teclado / passador
══════════════════════════════════════════════ */
export default function MonitorPage({ params }) {
  const resolvedParams = params ? (params.then ? use(params) : params) : {};
  const sector = resolvedParams?.sector || "farmacia";

  const state = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    () => monitorServerSnapshot,
  );

  const [time, setTime] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [calling, setCalling] = useState(false);

  // Ao abrir o monitor, ajusta o histórico para mostrar apenas a última senha chamada
  useEffect(() => {
    if (!sector) return;
    
    const prev = readQueueState();
    const queue = normalizeQueue(prev[sector] || {});
    
    // Determina qual foi a última senha chamada baseada nos contadores
    const normalCurrent = queue.normalCurrent || 0;
    const priorityCurrent = queue.priorityCurrent || 0;
    
    let currentPasswordEntry = null;
    
    // Se há senhas chamadas, cria uma entrada para a última senha
    if (normalCurrent > 0 || priorityCurrent > 0) {
      if (priorityCurrent >= normalCurrent && priorityCurrent > 0) {
        currentPasswordEntry = {
          number: priorityCurrent,
          type: "preferencial",
          time: new Date().toLocaleTimeString("pt-BR", { 
            hour: "2-digit", 
            minute: "2-digit" 
          }),
          id: `current-${priorityCurrent}-preferencial`
        };
      } else if (normalCurrent > 0) {
        currentPasswordEntry = {
          number: normalCurrent,
          type: "normal", 
          time: new Date().toLocaleTimeString("pt-BR", { 
            hour: "2-digit", 
            minute: "2-digit" 
          }),
          id: `current-${normalCurrent}-normal`
        };
      }
    }
    
    // Ajusta o histórico para mostrar apenas a senha atual (se existir)
    const updatedState = {
      ...prev,
      [sector]: {
        ...queue,
        history: currentPasswordEntry ? [currentPasswordEntry] : [],
        historyDate: queue.historyDate || new Date().toISOString().split('T')[0],
      },
    };
    
    saveQueueState(updatedState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  const audioEnabledRef = useRef(false);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  /* relógio */
  useEffect(() => {
    const t = setInterval(() => {
      setTime(
        new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* desbloqueia áudio no primeiro clique/tecla */
  useEffect(() => {
    const unlock = () => {
      unlockSpeech();
      speakText("Som ativado.");
      setAudioEnabled(true);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* registra esta aba como alto-falante após áudio desbloqueado */
  useEffect(() => {
    if (!audioEnabled) return;
    return registerMonitorSpeaker();
  }, [audioEnabled]);

  /* Supabase Realtime */
  useEffect(() => {
    if (!isSupabaseConfigured || !sector) return;
    const db = getRealtimeClient();
    if (!db) return;

    async function fetchInitialHistory() {
      try {
        // Busca apenas a última senha chamada (qualquer dia)
        // para manter o contador correto ao reabrir o sistema.
        // O histórico visual sempre começa vazio.
        const { data: lastCallData } = await db
          .from("queue_calls")
          .select("number_int, type")
          .eq("sector_id", sector)
          .order("id", { ascending: false })
          .limit(1);

        const prev  = getQueueSnapshot() || monitorServerSnapshot;
        const queue = prev[sector] || {};

        let normalCurrent   = queue.normalCurrent   ?? 0;
        let priorityCurrent = queue.priorityCurrent ?? 0;

        const lastCall = lastCallData?.[0];
        if (lastCall) {
          const isPreferencial =
            lastCall.type === "preferencial" || lastCall.type === "preferential";
          if (isPreferencial) {
            priorityCurrent = lastCall.number_int;
          } else {
            normalCurrent = lastCall.number_int;
          }
        }

        saveQueueState({
          ...prev,
          [sector]: {
            ...queue,
            normalCurrent,
            priorityCurrent,
            history: [], // sempre inicia vazio
          },
        });
      } catch (err) {
        console.error("Erro ao carregar histórico:", err);
      }
    }

    fetchInitialHistory();

    const channel = db
      .channel(`realtime-monitor-${sector}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "queue_calls",
          filter: `sector_id=eq.${sector}`,
        },
        (payload) => {
          const call = payload.new;
          if (!call?.number_int) return;

          const callKey = `${call.id || call.number_int}-${call.type}`;
          if (lastSpokenCallId === callKey) return;
          lastSpokenCallId = callKey;

          const prev = getQueueSnapshot() || monitorServerSnapshot;
          const queue = prev[sector] || {};
          const callType =
            call.type === "preferential" || call.type === "preferencial"
              ? "preferencial"
              : "normal";
          const field =
            callType === "preferencial" ? "priorityCurrent" : "normalCurrent";
          const timeStr = new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(call.created_at || Date.now()));

          const currentHistory = queue.history || [];
          const newEntry = {
            id: call.id,
            number: call.number_int,
            type: callType,
            time: timeStr,
          };

          saveQueueState({
            ...prev,
            [sector]: {
              ...queue,
              [field]: call.number_int,
              history: cleanHistory([newEntry, ...currentHistory]).slice(0, 30),
            },
          });

          if (audioEnabledRef.current) {
            monitorSpeak(call.number_int, callType);
          }
        },
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [sector]);

  /* ─── chamar próxima senha (via teclado / passador) ─── */
  const callNext = useCallback(
    async (type) => {
      if (calling) return;
      setCalling(true);

      await withQueueLock(async () => {
        let next = null;
        try {
          const res = await fetch("/api/queue/call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sector, type, attendantId: null }),
          });
          const data = await res.json();
          if (!res.ok) {
            if (data.useLocal) {
              const ls = normalizeQueue(readQueueState()[sector]);
              next =
                type === "preferencial"
                  ? nextQueueNumber(ls.priorityCurrent)
                  : nextQueueNumber(ls.normalCurrent);
            } else {
              setCalling(false);
              return;
            }
          } else {
            next = Number(data.number);
          }
        } catch {
          const ls = normalizeQueue(readQueueState()[sector]);
          next =
            type === "preferencial"
              ? nextQueueNumber(ls.priorityCurrent)
              : nextQueueNumber(ls.normalCurrent);
        }

        next = Number(next);
        if (!Number.isInteger(next) || next < 1 || next > 1000) {
          setCalling(false);
          return;
        }

        // Atualiza só o contador atual para feedback visual imediato.
        // NÃO adiciona ao histórico — o Realtime é a única fonte de verdade
        // para o histórico, evitando duplicação em produção.
        const latest = readQueueState();
        const q = normalizeQueue(latest[sector]);
        const field =
          type === "preferencial" ? "priorityCurrent" : "normalCurrent";

        saveQueueState({
          ...latest,
          [sector]: {
            ...q,
            [field]: next,
            // histórico inalterado — Realtime vai inserir
          },
        });

        if (audioEnabledRef.current) forceAnnounce(next, type);
      });

      setCalling(false);
    },
    [calling, sector],
  );

  /* ─── repetir última senha ─── */
  const reCall = useCallback(() => {
    const q = normalizeQueue(
      (getQueueSnapshot() || monitorServerSnapshot)[sector],
    );
    const last = q.history[0];
    if (!last) return;
    if (audioEnabledRef.current) forceAnnounce(last.number, last.type);
  }, [sector]);

  /* ─── atalhos de teclado ─── */
  useEffect(() => {
    function onKey(e) {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName))
        return;
      const k = e.key;
      if (["ArrowRight", "PageDown", "Enter", " "].includes(k)) {
        e.preventDefault();
        callNext("normal");
      } else if (["ArrowLeft", "PageUp"].includes(k)) {
        e.preventDefault();
        callNext("preferencial");
      } else if (["ArrowUp", "Home"].includes(k)) {
        e.preventDefault();
        reCall();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [callNext, reCall]);

  /* ─── atalhos de mouse ─── */
  useEffect(() => {
    function onMouseDown(e) {
      // ignora cliques em botões/links
      if (e.target.closest("a, button, input, select, textarea")) return;
      if (e.button === 0) {
        e.preventDefault();
        callNext("normal");
      } else if (e.button === 2) {
        e.preventDefault();
        callNext("preferencial");
      }
    }
    function onWheel(e) {
      if (e.target.closest("a, button, input, select, textarea")) return;
      e.preventDefault();
      reCall();
    }
    function onContextMenu(e) {
      // bloqueia o menu de contexto para o botão direito funcionar
      if (!e.target.closest("a, button, input, select, textarea")) {
        e.preventDefault();
      }
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [callNext, reCall]);

  /* ─── render ─── */
  const info = SECTORS[sector] || SECTORS.farmacia;
  const current = state[sector] || monitorServerSnapshot[sector];
  const validHistory = cleanHistory(current.history || []);
  
  // A primeira entrada do histórico é sempre a senha atual
  const latest = validHistory[0] || { number: 0, type: "normal" };
  
  // As "últimas senhas" são as entradas seguintes (excluindo a atual)
  const recentCalls = validHistory.slice(1, 5);
  const isPriority = latest.type === "preferencial";

  return (
    <main className={styles.monitor}>
      <header className={styles.header}>
        <div className={styles.sectorTitle}>{info.name.toUpperCase()}</div>
        <div className={styles.heading}>
          <strong>CENTRAL DE ATENDIMENTO</strong>
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.clock}>
            <Clock3 size={18} />
            {time}
          </div>
          <div className={styles.date}>
            {new Intl.DateTimeFormat("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
              .format(new Date())
              .toUpperCase()}
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.leftColumn}>
          <section
            className={`${styles.featured} ${isPriority ? styles.featuredPriority : ""}`}
          >
            <p>SENHA</p>
            <strong>{formatMonitorNumber(latest.number)}</strong>
            {isPriority ? (
              <span className={styles.priorityTag}>
                ATENDIMENTO PREFERENCIAL
              </span>
            ) : (
              <span>ATENDIMENTO</span>
            )}
            <small>Dirija-se ao balcão de atendimento</small>
          </section>

          <section className={styles.recent}>
            <p className={styles.kicker}>ÚLTIMAS SENHAS</p>
            {recentCalls.length > 0 ? (
              recentCalls.map((item, i) => (
                <div
                  className={styles.historyItem}
                  key={`${item.id || item.number}-${item.type}-${i}`}
                >
                  <strong
                    className={
                      item.type === "preferencial"
                        ? styles.priorityNumber
                        : styles.normalNumber
                    }
                  >
                    {formatMonitorNumber(item.number)}
                  </strong>
                  {item.type === "preferencial" ? (
                    <span className={styles.priorityTagSmall}>
                      PREFERENCIAL
                    </span>
                  ) : (
                    <span className={styles.normal}>ATENDIMENTO</span>
                  )}
                  <time>{item.time}</time>
                </div>
              ))
            ) : (
              <p style={{ fontSize: "14px", color: "#888", marginTop: "12px" }}>
                Aguardando chamadas anteriores...
              </p>
            )}
          </section>
        </section>

        <section className={styles.news}>
          <NewsCarousel />
        </section>
      </div>
    </main>
  );
}
