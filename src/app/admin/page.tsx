"use client";

import { useEffect, useRef, useState, useSyncExternalStore, } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Monitor, RotateCcw, Save, Trash2, } from "lucide-react";
import {
  getQueueSnapshot,
  getServerQueueSnapshot,
  getServerSessionSnapshot,
  getSessionSnapshot, MIN_QUEUE_NUMBER,
  normalizeQueue,
  saveQueueState,
  subscribeQueue,
  subscribeSession,
} from "@/lib/queue";
import {
  SECTORS,
  DEFAULT_SECTOR,
  CALL_TYPES,
  MAX_QUEUE_NUMBER,
  NO_PASSWORD,
  getSector,
} from "@/lib/constants";
import type { SessionSnapshot } from "@/lib/queue";
import type { NewsItem } from "@/lib/repositories/types";
import { errorMessage } from "@/lib/repositories/utils";
import { readJson } from "@/lib/json";
import type {
  ApiErrorBody,
  NewsCreateBody,
  NewsListBody,
  QueueSyncBody,
} from "@/types/api";
import {
  NEWS_CREATE,
  NEWS_DELETE,
  QUEUE_RESET,
  QUEUE_SYNC,
  SCREEN_ADMIN,
  SCREEN_ADMIN_FILAS,
  SCREEN_ADMIN_NOTICIAS,
  SCREEN_ADMIN_USUARIOS,
  SECTORS_MANAGE_ALL,
  canAccessSector,
  hasPermission,
} from "@/lib/permissions";
import styles from "./Admin.module.css";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import AccessSection from "./AccessSection";

/**
 * Item do carrossel de notícias da tela de administração: o que vem do
 * servidor (`NewsItem`) ou um rascunho ainda não publicado — só esse tem
 * `_file`, o arquivo que `saveNews` envia no `FormData`.
 */
type AdminNews = NewsItem & { readonly _file?: File };

const newsCache: NewsItem[] = [];
const serverNewsSnapshot: NewsItem[] = [];

function getNewsSnapshot(): readonly NewsItem[] {
  if (typeof window === "undefined") return serverNewsSnapshot;
  return newsCache;
}

function getServerNewsSnapshot(): readonly NewsItem[] {
  return serverNewsSnapshot;
}

function subscribeNews(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("news-updated", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("news-updated", callback);
  };
}

export default function AdminPage() {
  const router = useRouter();

  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );
  const state = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getServerQueueSnapshot,
  );
  const news = useSyncExternalStore(
    subscribeNews,
    getNewsSnapshot,
    getServerNewsSnapshot,
  );

  const [title, setTitle] = useState("");
  const [image, setImage] = useState("");
  const [message, setMessage] = useState("");
  const [draftNews, setDraftNews] = useState<AdminNews[]>([]);
  const [savingNews, setSavingNews] = useState(false);
  const [resettingSector, setResettingSector] = useState<Record<string, boolean>>({});
  const [, refreshNews] = useState(0);
  const pendingFileRef = useRef<File | null>(null);

  /* segurança: a seção /admin exige a permissão de tela `tela.admin`
     (o proxy também bloqueia no servidor — aqui é só a camada visual) */
  useEffect(() => {
    const storedSession = getSessionSnapshot();
    if (!storedSession) {
      router.push("/login");
    } else if (!hasPermission(storedSession, SCREEN_ADMIN)) {
      router.push("/home");
    }
  }, [router]);

  /* notícias */
  useEffect(() => {
    fetch("/api/news")
      .then((r) => (r.ok ? readJson<NewsListBody>(r) : null))
      .then((data) => {
        if (!data?.news) return;
        newsCache.splice(0, newsCache.length, ...data.news);
        setDraftNews(data.news);
        refreshNews((v) => v + 1);
        window.dispatchEvent(new Event("news-updated"));
      })
      .catch(() => {
      });
  }, []);

  if (!session) return null;

  /* permissões desta sessão: cada bloco da tela se renderiza por conta própria */
  const canManageFilas = hasPermission(session, SCREEN_ADMIN_FILAS);
  const canReset = hasPermission(session, QUEUE_RESET);
  const canSync = hasPermission(session, QUEUE_SYNC);
  const canManageNews = hasPermission(session, SCREEN_ADMIN_NOTICIAS);
  const canCreateNews = hasPermission(session, NEWS_CREATE);
  const canDeleteNews = hasPermission(session, NEWS_DELETE);
  const canManageUsers = hasPermission(session, SCREEN_ADMIN_USUARIOS);
  const canManageAllSectors = hasPermission(session, SECTORS_MANAGE_ALL);

  /* ── reset de fila ── */
  async function resetSector(sectorId: string) {
    const isAll = sectorId === "all";
    const label = isAll
      ? "TODOS os setores (Farmácia e Recepção)"
      : getSector(sectorId)?.name || sectorId;

    const msg = isAll
      ? `ATENÇÃO\n\nIsso vai zerar as senhas de ${label}.\n\nA numeração voltará para ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}. Esta ação não pode ser desfeita.\n\nDeseja continuar?`
      : `Zerar as senhas do setor "${label}"?\n\nA numeração voltará para ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}.`;

    if (!window.confirm(msg)) return;

    const sectorsToReset = isAll ? Object.keys(SECTORS) : [sectorId];
    setResettingSector((prev) => {
      const next = { ...prev };
      sectorsToReset.forEach((s) => (next[s] = true));
      return next;
    });
    setMessage("");

    try {
      // Server first: the local replica is only dropped once the server has
      // actually reset. Doing it the other way round left every client wiped
      // locally while the server still had the old queue, with no rollback.
      const res = await fetch("/api/queue/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: sectorId }),
      });
      const data = await readJson<ApiErrorBody>(res).catch<ApiErrorBody>(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "Erro ao zerar o contador no banco.");
        return;
      }

      const currentState = getQueueSnapshot();
      const next = { ...currentState };
      sectorsToReset.forEach((s) => {
        next[s] = {
          ...normalizeQueue(currentState[s]),
          normalCurrent: NO_PASSWORD,
          priorityCurrent: NO_PASSWORD,
          history: [],
        };
      });
      saveQueueState(next);

      setMessage(
        isAll
          ? `Todas as senhas foram resetadas. Numeração reinicia em ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}.`
          : `Senhas de "${label}" zeradas. Numeração reinicia em ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}.`,
      );
    } catch {
      setMessage("Erro ao zerar os contadores.");
    } finally {
      setResettingSector((prev) => {
        const next = { ...prev };
        sectorsToReset.forEach((s) => delete next[s]);
        return next;
      });
    }
  }

  /* ── notícias ── */
  function addNews(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title || !pendingFileRef.current) return;
    setDraftNews([
      {
        id: `draft-${Date.now()}`,
        title,
        image,
        _file: pendingFileRef.current,
      },
      ...draftNews,
    ]);
    setTitle("");
    setImage("");
    pendingFileRef.current = null;
    setMessage(
      "Alteração pendente. Clique em 'Salvar notícias' para publicar.",
    );
  }

  async function saveNews() {
    setSavingNews(true);
    setMessage("");
    try {
      // Remove os que foram deletados do rascunho
      const removed = news.filter(
        (item) => !draftNews.some((d) => String(d.id) === String(item.id)),
      );
      for (const item of removed) {
        await fetch(`/api/news?id=${item.id}`, { method: "DELETE" });
      }

      // Cria os novos (que têm id começando com "draft-"). O predicado
      // também garante o arquivo: só rascunho criado em `addNews` tem `_file`,
      // então na prática nada é pulado — e o TS entrega um `File` para o
      // `FormData.append`.
      const created: NewsItem[] = [];
      for (const item of draftNews.filter(
        (d): d is AdminNews & { readonly _file: File } =>
          String(d.id).startsWith("draft-") && d._file !== undefined,
      )) {
        const fd = new FormData();
        fd.append("title", item.title);
        fd.append("image", item._file);
        const res = await fetch("/api/news", { method: "POST", body: fd });
        const data = await readJson<NewsCreateBody>(res);
        if (!res.ok) throw new Error(data.error);
        created.push(data.news);
      }

      const res = await fetch("/api/news");
      const data = await readJson<NewsListBody>(res);
      if (!res.ok) throw new Error(data.error);
      newsCache.splice(0, newsCache.length, ...data.news);
      setDraftNews(data.news);
      refreshNews((v) => v + 1);
      window.dispatchEvent(new Event("news-updated"));
      setMessage(`${created.length} notícia(s) salva(s) com sucesso.`);
    } catch (err) {
      setMessage(errorMessage(err, "Não foi possível salvar as notícias."));
    } finally {
      setSavingNews(false);
    }
  }

  function deleteNews(id: string) {
    setDraftNews(draftNews.filter((item) => String(item.id) !== String(id)));
    setMessage(
      "Exclusão pendente. Clique em 'Salvar notícias' para confirmar.",
    );
  }

  function readImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingFileRef.current = file;
    // preview local via URL temporária
    setImage(URL.createObjectURL(file));
  }

  return (
    <SidebarLayout
      activeRoute="admin"
      session={session}
      sectorInfo={null}
      eyebrow="CONTROLE CENTRAL"
      title="Administração"
      subtitle="Gerencie as filas de atendimento e as notícias do monitor."
      headerActions={null}
    >
      <section className={styles.content}>
        {message && <div className={styles.alertBox}>{message}</div>}

        {/* ── Controle de filas ── */}
        {canManageFilas && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <p>FILAS POR SERVIÇO</p>
              <h2 className="font-bold">Controle dos atendimentos</h2>
            </div>
          </div>

          <div className={styles.sectors}>
            {Object.values(SECTORS)
              .filter((item) => canAccessSector(session, item.id, "read"))
              .map((item) => {
              const queue = normalizeQueue(state[item.id]);
              const isReset = !!resettingSector[item.id];
              const canResetSector = canReset && canAccessSector(session, item.id, "write");
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      Normal: {queue.normalCurrent === null || queue.normalCurrent === undefined
                        ? "N---"
                        : `N${String(queue.normalCurrent).padStart(3, "0")}`} ·
                      Preferencial: {queue.priorityCurrent === null || queue.priorityCurrent === undefined
                        ? "P---"
                        : `P${String(queue.priorityCurrent).padStart(3, "0")}`}
                    </small>
                  </div>
                  <div className={styles.cardActions}>
                    <Link href={`/monitor/${item.id}`} target="_blank">
                      <Monitor size={16}/> Abrir Monitor
                    </Link>
                    {canResetSector && (
                      <button
                        type="button"
                        onClick={() => void resetSector(item.id)}
                        disabled={isReset}
                        className={styles.resetSectorButton}
                      >
                        <RotateCcw size={16}/>
                        {isReset ? "Resetando…" : "Resetar senhas"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {canReset && canManageAllSectors && (
            <div className={styles.resetAllWrapper}>
              <div className={styles.resetAllInfo}>
                <AlertTriangle size={16}/>
                <span>
                  Resetar todos os setores de uma vez — numeração volta para {MIN_QUEUE_NUMBER.toString().padStart(3, "0")} em todos.
                </span>
              </div>
              <button
                type="button"
                className={styles.resetAllButton}
                onClick={() => void resetSector("all")}
                disabled={Object.keys(resettingSector).length > 0}
              >
                <RotateCcw size={16}/>
                {Object.keys(resettingSector).length > 0
                  ? "Resetando…"
                  : "Resetar todos os setores"}
              </button>
            </div>
          )}
        </section>
        )}

        {/* ── Sincronizar senhas ── */}
        {canManageFilas && <SyncSection session={session} canSync={canSync} />}

        {/* ── Notícias do monitor ── */}
        {canManageNews && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <p>COMUNICAÇÃO</p>
              <h2 className="font-bold">Notícias do monitor</h2>
            </div>
          </div>

          {canCreateNews && (
            <form className={styles.newsForm} onSubmit={addNews}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da notícia"
                required
              />
              <label className={styles.upload}>
                <ImagePlus size={18}/>{" "}
                {image ? "Imagem selecionada" : "Adicionar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={readImage}
                  required
                />
              </label>
              <button type="submit">
                <ImagePlus size={16}/> Adicionar à lista
              </button>
            </form>
          )}

          <div className={styles.newsGrid}>
            {draftNews.map((item, i) => (
              <article key={`${item.title}-${i}`}>
                <Image
                  src={item.image}
                  alt=""
                  width={300}
                  height={170}
                  unoptimized
                />
                <strong>{item.title}</strong>
                {canDeleteNews && (
                  <button
                    className={styles.deleteNews}
                    type="button"
                    onClick={() => deleteNews(item.id)}
                  >
                    <Trash2 size={14}/> Excluir
                  </button>
                )}
              </article>
            ))}
          </div>

          {(canCreateNews || canDeleteNews) && (
            <button
              className={styles.saveNews}
              type="button"
              onClick={() => void saveNews()}
              disabled={savingNews}
            >
              <Save size={16}/> {savingNews ? "Salvando…" : "Salvar notícias"}
            </button>
          )}
        </section>
        )}

        {/* ── Gerenciamento de usuários e permissões ── */}
        {canManageUsers && <AccessSection />}
      </section>
    </SidebarLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   SEÇÃO DE SINCRONIZAÇÃO DE SENHAS
═══════════════════════════════════════════════════════════ */
interface SyncSectionProps {
  readonly session: SessionSnapshot;
  readonly canSync: boolean;
}

function SyncSection({ session, canSync }: SyncSectionProps) {
  const [syncSector, setSyncSector] = useState(DEFAULT_SECTOR);
  // Vem de um <select> (valor cru da DOM) e vai para `normalizeCallType`, que
  // aceita `string` — por isso `string` e não `CallType`.
  const [syncType, setSyncType] = useState<string>(CALL_TYPES.NORMAL);
  const [syncNumber, setSyncNumber] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Setores operáveis por esta sessão (escopo de escrita)
  const syncSectors = Object.values(SECTORS).filter((s) =>
    canAccessSector(session, s.id, "write"),
  );

  async function handleSync(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSyncMessage("");
    setSyncing(true);

    try {
      const num = parseInt(syncNumber, 10);
      if (!num || num < 1 || num > MAX_QUEUE_NUMBER) {
        setSyncMessage("Use um número entre 1 e 999.");
        return;
      }

      const res = await fetch("/api/queue/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: syncSector,
          type: syncType,
          nextNumber: num,
        }),
      });
      const data = await readJson<QueueSyncBody>(res);

      if (!res.ok) throw new Error(data.error);

      setSyncMessage(data.message || `Próxima senha: ${data.numberStr}`);
      setSyncNumber("");
    } catch (err) {
      setSyncMessage(errorMessage(err, "Erro ao sincronizar senha."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        <div>
          <p>CONTROLE</p>
          <h2 className="font-bold">Sincronizar senhas</h2>
        </div>
      </div>

      <p className={styles.syncInfo}>
        Pule para um número específico de senha. Útil quando senhas são perdidas
        ou não aparecem nos monitores.
      </p>

      {!canSync && (
        <div className={styles.alertBox}>
          Sua sessão não tem a permissão <strong>filas.sincronizar</strong>.
        </div>
      )}

      {syncMessage && <div className={styles.alertBox}>{syncMessage}</div>}

      {canSync && (
      <form className={styles.syncForm} onSubmit={(e) => void handleSync(e)}>
        <div className={styles.syncRow}>
          <label>
            Setor
            <select
              value={syncSector}
              onChange={(e) => setSyncSector(e.target.value)}
            >
              {syncSectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Tipo
            <select
              value={syncType}
              onChange={(e) => setSyncType(e.target.value)}
            >
              <option value={CALL_TYPES.NORMAL}>Normal</option>
              <option value={CALL_TYPES.PREFERENCIAL}>Preferencial</option>
            </select>
          </label>

          <label>
            Próximo número
            <input
              type="number"
              min="1"
              max="999"
              value={syncNumber}
              onChange={(e) => setSyncNumber(e.target.value)}
              placeholder="Ex: 045"
              required
            />
          </label>

          <label>
            &nbsp;
            <button
              type="submit"
              className={styles.syncButton}
              disabled={syncing || !syncNumber}
            >
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </button>
          </label>
        </div>
      </form>
      )}
    </section>
  );
}
