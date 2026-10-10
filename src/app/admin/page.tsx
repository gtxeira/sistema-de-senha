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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  alertBoxStyle,
  fieldLabelStyle,
  fieldStyle,
  sectionEyebrowStyle,
  sectionHeadingStyle,
  sectionStyle,
  sectionTitleStyle,
} from "./admin-styles";
import { SidebarLayout } from "@/components/SidebarLayout/SidebarLayout";
import AccessSection from "./AccessSection";

/* ── classes locais desta tela (as comuns vêm de ./admin-styles) ── */

/** Base dos botões `.cardActions a, .cardActions button, .newsForm button`. */
const actionBaseStyle =
  "flex cursor-pointer items-center gap-1.5 rounded-[6px] border-current px-2.5 py-2 text-[11px] font-bold no-underline";

/** Cartões de setor: grid duplo que vira coluna no mobile. */
const sectorsStyle = "mt-5 grid grid-cols-2 gap-3.5 max-[700px]:grid-cols-1";
const sectorCardStyle =
  "flex justify-between gap-3 rounded-[8px] border border-[#e1ebee] p-[18px] max-[700px]:block";
const cardActionsStyle = "flex flex-col gap-2 max-[700px]:mt-[15px]";
const cardLinkStyle = `${actionBaseStyle} bg-[#eaf5f7] text-[#20738c]`;
const cardResetStyle = `${actionBaseStyle} bg-[#ffeaea] font-extrabold text-[#c0392b] disabled:cursor-wait disabled:opacity-60`;

/** Faixa laranja de "resetar todos os setores". */
const resetAllWrapperStyle =
  "mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[#f5d9b8] bg-[#fff8f0] px-[18px] py-4";
const resetAllInfoStyle =
  "flex min-w-[200px] flex-1 items-center gap-2.5 text-[12px] leading-normal text-[#7a4a1e]";
const resetAllButtonStyle =
  "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border-current bg-[#c0392b] px-[18px] py-[11px] text-[12px] font-extrabold text-white transition-[background-color] duration-[150ms] enabled:hover:bg-[#a93226] disabled:cursor-wait disabled:opacity-[0.65]";

/** Formulário e grade de notícias do monitor. */
const newsFormStyle =
  "mt-5 grid grid-cols-[1.3fr_1fr_auto] gap-2.5 max-[700px]:grid-cols-1";
const newsFieldStyle = "rounded-[6px] border border-[#d3e1e6] p-3 text-[12px]";
const uploadStyle = `${newsFieldStyle} flex cursor-pointer items-center gap-[7px] text-[#33778b]`;
const newsSubmitStyle = `${actionBaseStyle} justify-center bg-[#0d7196] text-white`;
const newsGridStyle = "mt-5 flex flex-wrap gap-3";
const newsCardStyle =
  "w-[150px] overflow-hidden rounded-[7px] border border-[#e1ebee]";
const newsTitleStyle = "block p-[9px] text-[11px]";
const deleteNewsStyle =
  "flex w-full cursor-pointer items-center justify-center gap-[5px] border-t border-[#e1ebee] bg-white p-2 text-[11px] font-bold text-[#b44e45]";
const saveNewsStyle =
  "mt-[18px] flex cursor-pointer items-center gap-[7px] rounded-[6px] border-current bg-[#168a78] px-4 py-[11px] text-[12px] font-extrabold text-white disabled:cursor-wait disabled:opacity-[0.65]";

/** Seção de sincronização de senha. */
const syncInfoStyle = "mb-4 text-[13px] leading-normal text-[#5a7a8a]";
const syncRowStyle =
  "grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 max-[700px]:grid-cols-1";
const syncButtonStyle =
  "cursor-pointer whitespace-nowrap rounded-[8px] border-current bg-[#1678a0] px-6 py-[13px] text-[13px] font-bold text-white transition-[background-color] duration-[150ms] enabled:hover:bg-[#1389b8] disabled:cursor-default disabled:opacity-50";

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
  // alvo do reset pendente de confirmação (`"all"` ou o id do setor);
  // null = diálogo fechado
  const [resetPending, setResetPending] = useState<string | null>(null);
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

  /* ── reset de fila ──
     O `window.confirm` virou um AlertDialog: os botões só guardam o alvo em
     `resetPending` (abrindo o diálogo) e a ação roda em `confirmReset`,
     quando o usuário confirma. */
  const resetIsAll = resetPending === "all";
  const resetLabel = resetPending
    ? resetIsAll
      ? "TODOS os setores (Farmácia e Recepção)"
      : getSector(resetPending)?.name || resetPending
    : "";

  async function confirmReset() {
    const sectorId = resetPending;
    if (!sectorId) return;
    setResetPending(null);

    const isAll = sectorId === "all";
    const label = isAll
      ? "TODOS os setores (Farmácia e Recepção)"
      : getSector(sectorId)?.name || sectorId;

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
      <section>
        {message && <div className={alertBoxStyle}>{message}</div>}

        {/* ── Controle de filas ── */}
        {canManageFilas && (
        <section className={sectionStyle}>
          <div className={sectionTitleStyle}>
            <div>
              <p className={sectionEyebrowStyle}>FILAS POR SERVIÇO</p>
              <h2 className={`font-bold ${sectionHeadingStyle}`}>Controle dos atendimentos</h2>
            </div>
          </div>

          <div className={sectorsStyle}>
            {Object.values(SECTORS)
              .filter((item) => canAccessSector(session, item.id, "read"))
              .map((item) => {
              const queue = normalizeQueue(state[item.id]);
              const isReset = !!resettingSector[item.id];
              const canResetSector = canReset && canAccessSector(session, item.id, "write");
              return (
                <article key={item.id} className={sectorCardStyle}>
                  <div>
                    <strong className="block">{item.name}</strong>
                    <small className="mt-2 block text-[11px] text-[#7a919e]">
                      Normal: {queue.normalCurrent === null || queue.normalCurrent === undefined
                        ? "N---"
                        : `N${String(queue.normalCurrent).padStart(3, "0")}`} ·
                      Preferencial: {queue.priorityCurrent === null || queue.priorityCurrent === undefined
                        ? "P---"
                        : `P${String(queue.priorityCurrent).padStart(3, "0")}`}
                    </small>
                  </div>
                  <div className={cardActionsStyle}>
                    <Link href={`/monitor/${item.id}`} target="_blank" className={cardLinkStyle}>
                      <Monitor size={16}/> Abrir Monitor
                    </Link>
                    {canResetSector && (
                      <button
                        type="button"
                        onClick={() => setResetPending(item.id)}
                        disabled={isReset}
                        className={cardResetStyle}
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
            <div className={resetAllWrapperStyle}>
              <div className={resetAllInfoStyle}>
                <AlertTriangle size={16} className="shrink-0 text-[#c97a1e]"/>
                <span>
                  Resetar todos os setores de uma vez — numeração volta para {MIN_QUEUE_NUMBER.toString().padStart(3, "0")} em todos.
                </span>
              </div>
              <button
                type="button"
                className={resetAllButtonStyle}
                onClick={() => setResetPending("all")}
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
        <section className={sectionStyle}>
          <div className={sectionTitleStyle}>
            <div>
              <p className={sectionEyebrowStyle}>COMUNICAÇÃO</p>
              <h2 className={`font-bold ${sectionHeadingStyle}`}>Notícias do monitor</h2>
            </div>
          </div>

          {canCreateNews && (
            <form className={newsFormStyle} onSubmit={addNews}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da notícia"
                className={newsFieldStyle}
                required
              />
              <label className={uploadStyle}>
                <ImagePlus size={18}/>{" "}
                {image ? "Imagem selecionada" : "Adicionar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={readImage}
                  className="hidden"
                  required
                />
              </label>
              <button type="submit" className={newsSubmitStyle}>
                <ImagePlus size={16}/> Adicionar à lista
              </button>
            </form>
          )}

          <div className={newsGridStyle}>
            {draftNews.map((item, i) => (
              <article key={`${item.title}-${i}`} className={newsCardStyle}>
                <Image
                  src={item.image}
                  alt=""
                  width={300}
                  height={170}
                  className="h-[85px] w-full object-cover"
                  unoptimized
                />
                <strong className={newsTitleStyle}>{item.title}</strong>
                {canDeleteNews && (
                  <button
                    className={deleteNewsStyle}
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
              className={saveNewsStyle}
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

        {/* Confirmação do reset — o antigo `window.confirm` */}
        <AlertDialog
          open={resetPending !== null}
          onOpenChange={(open) => {
            if (!open) setResetPending(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {resetIsAll
                  ? "ATENÇÃO"
                  : `Zerar as senhas do setor "${resetLabel}"?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">
                {resetIsAll
                  ? `Isso vai zerar as senhas de ${resetLabel}.\n\nA numeração voltará para ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}. Esta ação não pode ser desfeita.\n\nDeseja continuar?`
                  : `A numeração voltará para ${MIN_QUEUE_NUMBER.toString().padStart(3, "0")}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void confirmReset()}
              >
                Resetar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
    <section className={sectionStyle}>
      <div className={sectionTitleStyle}>
        <div>
          <p className={sectionEyebrowStyle}>CONTROLE</p>
          <h2 className={`font-bold ${sectionHeadingStyle}`}>Sincronizar senhas</h2>
        </div>
      </div>

      <p className={syncInfoStyle}>
        Pule para um número específico de senha. Útil quando senhas são perdidas
        ou não aparecem nos monitores.
      </p>

      {!canSync && (
        <div className={alertBoxStyle}>
          Sua sessão não tem a permissão <strong>filas.sincronizar</strong>.
        </div>
      )}

      {syncMessage && <div className={alertBoxStyle}>{syncMessage}</div>}

      {canSync && (
      <form className="mt-4" onSubmit={(e) => void handleSync(e)}>
        <div className={syncRowStyle}>
          <label className={fieldLabelStyle}>
            Setor
            <select
              value={syncSector}
              onChange={(e) => setSyncSector(e.target.value)}
              className={fieldStyle}
            >
              {syncSectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>

          <label className={fieldLabelStyle}>
            Tipo
            <select
              value={syncType}
              onChange={(e) => setSyncType(e.target.value)}
              className={fieldStyle}
            >
              <option value={CALL_TYPES.NORMAL}>Normal</option>
              <option value={CALL_TYPES.PREFERENCIAL}>Preferencial</option>
            </select>
          </label>

          <label className={fieldLabelStyle}>
            Próximo número
            <input
              type="number"
              min="1"
              max="999"
              value={syncNumber}
              onChange={(e) => setSyncNumber(e.target.value)}
              placeholder="Ex: 045"
              className={fieldStyle}
              required
            />
          </label>

          <label className={fieldLabelStyle}>
            &nbsp;
            <button
              type="submit"
              className={syncButtonStyle}
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
