'use client';

import type { User } from 'next-auth';
import type {
  ApiErrorBody,
  NewsCreateBody,
  NewsListBody,
  QueueSyncBody,
} from '@/shared/types/api';
import type { NewsItem } from '@/shared/types/domain';

import {
  AlertTriangle,
  ImageIcon,
  ImagePlus,
  Monitor,
  RotateCcw,
  Save,
  Trash2,
  Trash2Icon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { AccessSection } from '@/app/(authenticated)/(dashboard)/admin/access-section';
import {
  sectionEyebrowStyle,
  sectionHeadingStyle,
  sectionStyle,
  sectionTitleStyle,
} from '@/app/(authenticated)/(dashboard)/admin/admin-styles';
import {
  getQueueSnapshot,
  getServerQueueSnapshot,
  MIN_QUEUE_NUMBER,
  normalizeQueue,
  saveQueueState,
  subscribeQueue,
} from '@/client/queue/queue';
import { cn } from '@/client/utils';
import { FilterGroup } from '@/components/filter-group';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useEffectiveSession } from '@/hooks/use-effective-session';
import {
  CALL_TYPES,
  DEFAULT_SECTOR,
  getSector,
  MAX_QUEUE_NUMBER,
  NO_PASSWORD,
  SECTORS,
} from '@/shared/constants';
import { errorMessage } from '@/shared/errors';
import { readJson } from '@/shared/json';
import {
  canAccessSector,
  hasPermission,
  NEWS_CREATE,
  NEWS_DELETE,
  QUEUE_RESET,
  QUEUE_SYNC,
  SCREEN_ADMIN_FILAS,
  SCREEN_ADMIN_NOTICIAS,
  SCREEN_ADMIN_USUARIOS,
  SECTORS_MANAGE_ALL,
} from '@/shared/permissions';

/**
 * Item do carrossel de notícias da tela de administração: o que vem do
 * servidor (`NewsItem`) ou um rascunho ainda não publicado — só esse tem
 * `_file`, o arquivo que `saveNews` envia no `FormData`.
 */
type AdminNews = NewsItem & { readonly _file?: File };

const newsCache: NewsItem[] = [];
const serverNewsSnapshot: NewsItem[] = [];

export default function AdminPage() {
  const session = useEffectiveSession();
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

  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [draftNews, setDraftNews] = useState<AdminNews[]>([]);
  const [savingNews, setSavingNews] = useState(false);
  const [resettingSector, setResettingSector] = useState<
    Record<string, boolean>
  >({});
  // alvo do reset pendente de confirmação (`"all"` ou o id do setor);
  // null = diálogo fechado
  const [resetPending, setResetPending] = useState<null | string>(null);
  // alvo da exclusão de notícia pendente de confirmação; null = diálogo fechado
  const [deleteNewsTarget, setDeleteNewsTarget] = useState<AdminNews | null>(
    null,
  );
  const [, refreshNews] = useState(0);
  const pendingFileRef = useRef<File | null>(null);

  /* notícias */
  useEffect(() => {
    fetch('/api/news')
      .then((r) => (r.ok ? readJson<NewsListBody>(r) : null))
      .then((data) => {
        if (!data?.news) return;
        newsCache.splice(0, newsCache.length, ...data.news);
        setDraftNews(data.news);
        refreshNews((v) => v + 1);
        window.dispatchEvent(new Event('news-updated'));
      })
      .catch(() => {});
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
  const resetIsAll = resetPending === 'all';
  let resetLabel = '';
  if (resetPending) {
    resetLabel = resetIsAll
      ? 'TODOS os setores (Farmácia e Recepção)'
      : getSector(resetPending)?.name || resetPending;
  }

  async function confirmReset() {
    const sectorId = resetPending;
    if (!sectorId) return;
    setResetPending(null);

    const isAll = sectorId === 'all';
    const label = isAll
      ? 'TODOS os setores (Farmácia e Recepção)'
      : getSector(sectorId)?.name || sectorId;

    const sectorsToReset = isAll ? Object.keys(SECTORS) : [sectorId];
    setResettingSector((prev) => {
      const next = { ...prev };
      sectorsToReset.forEach((s) => (next[s] = true));
      return next;
    });

    try {
      // Server first: the local replica is only dropped once the server has
      // actually reset. Doing it the other way round left every client wiped
      // locally while the server still had the old queue, with no rollback.
      const res = await fetch('/api/queue/reset', {
        body: JSON.stringify({ sector: sectorId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await readJson<ApiErrorBody>(res).catch<ApiErrorBody>(
        () => ({}),
      );

      if (!res.ok) {
        toast.add({
          title: data.error || 'Erro ao zerar o contador no banco.',
          type: 'error',
        });
        return;
      }

      const currentState = getQueueSnapshot();
      const next = { ...currentState };
      sectorsToReset.forEach((s) => {
        next[s] = {
          ...normalizeQueue(currentState[s]),
          history: [],
          normalCurrent: NO_PASSWORD,
          priorityCurrent: NO_PASSWORD,
        };
      });
      saveQueueState(next);

      toast.add({
        title: isAll
          ? `Todas as senhas foram resetadas. Numeração reinicia em ${MIN_QUEUE_NUMBER.toString().padStart(3, '0')}.`
          : `Senhas de "${label}" zeradas. Numeração reinicia em ${MIN_QUEUE_NUMBER.toString().padStart(3, '0')}.`,
        type: 'success',
      });
    } catch {
      toast.add({ title: 'Erro ao zerar os contadores.', type: 'error' });
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
        _file: pendingFileRef.current,
        image,
      },
      ...draftNews,
    ]);
    setTitle('');
    setImage('');
    pendingFileRef.current = null;
    toast.add({
      title: "Alteração pendente. Clique em 'Salvar notícias' para publicar.",
      type: 'info',
    });
  }

  async function saveNews() {
    setSavingNews(true);
    try {
      // Remove os que foram deletados do rascunho
      const removed = news.filter(
        (item) => !draftNews.some((d) => String(d.id) === String(item.id)),
      );
      for (const item of removed) {
        await fetch(`/api/news?id=${item.id}`, { method: 'DELETE' });
      }

      // Cria os novos (que têm id começando com "draft-"). O predicado
      // também garante o arquivo: só rascunho criado em `addNews` tem `_file`,
      // então na prática nada é pulado — e o TS entrega um `File` para o
      // `FormData.append`.
      const created: NewsItem[] = [];
      for (const item of draftNews.filter(
        (d): d is AdminNews & { readonly _file: File } =>
          String(d.id).startsWith('draft-') && d._file !== undefined,
      )) {
        const fd = new FormData();
        fd.append('title', item.title);
        fd.append('image', item._file);
        const res = await fetch('/api/news', { body: fd, method: 'POST' });
        const data = await readJson<NewsCreateBody>(res);
        if (!res.ok) throw new Error(data.error);
        created.push(data.news);
      }

      const res = await fetch('/api/news');
      const data = await readJson<NewsListBody>(res);
      if (!res.ok) throw new Error(data.error);
      newsCache.splice(0, newsCache.length, ...data.news);
      setDraftNews(data.news);
      refreshNews((v) => v + 1);
      window.dispatchEvent(new Event('news-updated'));
      toast.add({
        title: `${created.length} notícia(s) salva(s) com sucesso.`,
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: errorMessage(error, 'Não foi possível salvar as notícias.'),
        type: 'error',
      });
    } finally {
      setSavingNews(false);
    }
  }

  /* A exclusão só remove do rascunho: a remoção no servidor acontece ao
     salvar. O AlertDialog confirma a intenção antes de alterar o rascunho. */
  function confirmDeleteNews() {
    const target = deleteNewsTarget;
    if (!target) return;
    setDeleteNewsTarget(null);
    setDraftNews(
      draftNews.filter((item) => String(item.id) !== String(target.id)),
    );
    toast.add({
      title: "Exclusão pendente. Clique em 'Salvar notícias' para confirmar.",
      type: 'info',
    });
  }

  function readImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingFileRef.current = file;
    // preview local via URL temporária
    setImage(URL.createObjectURL(file));
  }

  return (
    <>
      <PageHeader
        eyebrow="CONTROLE CENTRAL"
        title="Administração"
        subtitle="Gerencie as filas de atendimento e as notícias do monitor."
      />

      <section>
        {/* ── Controle de filas ── */}
        {canManageFilas && (
          <section className={cn(sectionStyle, 'mt-0')}>
            <div className={sectionTitleStyle}>
              <div>
                <p className={sectionEyebrowStyle}>FILAS POR SERVIÇO</p>
                <h2 className={`font-bold ${sectionHeadingStyle}`}>
                  Controle dos atendimentos
                </h2>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              {Object.values(SECTORS)
                .filter((item) => canAccessSector(session, item.id, 'read'))
                .map((item) => {
                  const queue = normalizeQueue(state[item.id]);
                  const isReset = resettingSector[item.id];
                  const canResetSector =
                    canReset && canAccessSector(session, item.id, 'write');
                  return (
                    <article
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-[8px] border border-[#e1ebee] p-4.5 lg:flex-row"
                    >
                      <div>
                        <strong className="block">{item.name}</strong>
                        <small className="mt-2 block text-[11px] text-[#7a919e]">
                          Normal:{' '}
                          {queue.normalCurrent === null ||
                          queue.normalCurrent === undefined
                            ? 'N---'
                            : `N${String(queue.normalCurrent).padStart(3, '0')}`}{' '}
                          · Preferencial:{' '}
                          {queue.priorityCurrent === null ||
                          queue.priorityCurrent === undefined
                            ? 'P---'
                            : `P${String(queue.priorityCurrent).padStart(3, '0')}`}
                        </small>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/monitor/${item.id}`}
                          target="_blank"
                          className={cn(
                            buttonVariants({ size: 'sm', variant: 'outline' }),
                          )}
                        >
                          <Monitor data-icon="inline-start" /> Abrir Monitor
                        </Link>

                        {canResetSector && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setResetPending(item.id)}
                            disabled={isReset}
                          >
                            <RotateCcw data-icon="inline-start" />
                            {isReset ? 'Resetando…' : 'Resetar senhas'}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>

            {canReset && canManageAllSectors && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-[#f5d9b8] bg-[#fff8f0] px-4.5 py-4">
                <div className="flex min-w-50 flex-1 items-center gap-2.5 text-[12px] leading-normal text-[#7a4a1e]">
                  <AlertTriangle
                    size={16}
                    className="shrink-0 text-[#c97a1e]"
                  />
                  <span>
                    Resetar todos os setores de uma vez — numeração volta para{' '}
                    {MIN_QUEUE_NUMBER.toString().padStart(3, '0')} em todos.
                  </span>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setResetPending('all')}
                  disabled={Object.keys(resettingSector).length > 0}
                >
                  <RotateCcw data-icon="inline-start" />
                  {Object.keys(resettingSector).length > 0
                    ? 'Resetando…'
                    : 'Resetar todos os setores'}
                </Button>
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
                <h2 className={`font-bold ${sectionHeadingStyle}`}>
                  Notícias do monitor
                </h2>
              </div>
            </div>

            {canCreateNews && (
              <form
                className="mt-5 grid grid-cols-1 gap-2.5 lg:grid-cols-[1.3fr_1fr_auto]"
                onSubmit={addNews}
              >
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da notícia"
                  className="h-8"
                  required
                />
                <label className="flex h-8 cursor-pointer items-center gap-1.75 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent">
                  {image ? (
                    <ImageIcon data-icon="inline-start" className="size-4" />
                  ) : (
                    <ImagePlus data-icon="inline-start" className="size-4" />
                  )}

                  {image ? 'Imagem selecionada' : 'Adicionar imagem'}

                  <input
                    type="file"
                    accept="image/*"
                    onChange={readImage}
                    className="hidden"
                    required
                  />
                </label>

                <Button type="submit">
                  <ImagePlus data-icon="inline-start" /> Adicionar à lista
                </Button>
              </form>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {draftNews.map((item, i) => (
                <article
                  key={`${item.title}-${i}`}
                  className="w-[150px] overflow-hidden rounded-[7px] border border-[#e1ebee]"
                >
                  <Image
                    src={item.image}
                    alt=""
                    width={300}
                    height={170}
                    className="h-21.25 w-full object-cover"
                    unoptimized
                  />
                  <strong className="block p-[9px] text-[11px]">
                    {item.title}
                  </strong>
                  {canDeleteNews && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-center rounded-none border-t border-[#e1ebee] text-destructive hover:bg-[#fdecea] hover:text-destructive"
                      onClick={() => setDeleteNewsTarget(item)}
                    >
                      <Trash2 data-icon="inline-start" /> Excluir
                    </Button>
                  )}
                </article>
              ))}
            </div>

            {(canCreateNews || canDeleteNews) && (
              <Button
                className="mt-4.5"
                onClick={() => void saveNews()}
                disabled={savingNews}
              >
                <Save data-icon="inline-start" />{' '}
                {savingNews ? 'Salvando…' : 'Salvar notícias'}
              </Button>
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
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {resetIsAll
                  ? 'Zerar as senhas de todos os setores?'
                  : `Zerar as senhas do setor "${resetLabel}"?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="flex flex-col whitespace-pre-line">
                A numeração voltará para{' '}
                {MIN_QUEUE_NUMBER.toString().padStart(3, '0')}.
                <small className="mt-1">
                  Esta ação não poderá ser desfeita.
                </small>
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

        {/* Confirmação de exclusão de notícia — mesmo padrão do reset */}
        <AlertDialog
          open={deleteNewsTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteNewsTarget(null);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>Excluir esta notícia?</AlertDialogTitle>
              <AlertDialogDescription className="flex flex-col">
                A imagem{' '}
                {deleteNewsTarget ? `"${deleteNewsTarget.title}" ` : null}
                sairá da lista exibida no monitor.
                <small className="mt-1">
                  A exclusão é efetivada ao clicar em &quot;Salvar
                  notícias&quot;.
                </small>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => confirmDeleteNews()}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SEÇÃO DE SINCRONIZAÇÃO DE SENHAS
═══════════════════════════════════════════════════════════ */
interface SyncSectionProps {
  readonly canSync: boolean;
  readonly session: User;
}

function getNewsSnapshot(): readonly NewsItem[] {
  if (typeof window === 'undefined') return serverNewsSnapshot;
  return newsCache;
}

function getServerNewsSnapshot(): readonly NewsItem[] {
  return serverNewsSnapshot;
}

function subscribeNews(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('news-updated', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('news-updated', callback);
  };
}

function SyncSection({ canSync, session }: SyncSectionProps) {
  const [syncSector, setSyncSector] = useState(DEFAULT_SECTOR);
  // Vem do Select (valor cru da lib) e vai para `normalizeCallType`, que
  // aceita `string` — por isso `string` e não `CallType`.
  const [syncType, setSyncType] = useState<string>(CALL_TYPES.NORMAL);
  const [syncNumber, setSyncNumber] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Setores operáveis por esta sessão (escopo de escrita)
  const syncSectors = Object.values(SECTORS).filter((s) =>
    canAccessSector(session, s.id, 'write'),
  );

  async function handleSync(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSyncing(true);

    try {
      const num = Number.parseInt(syncNumber, 10);
      if (!num || num < 1 || num > MAX_QUEUE_NUMBER) {
        toast.add({ title: 'Use um número entre 1 e 999.', type: 'error' });
        return;
      }

      const res = await fetch('/api/queue/sync', {
        body: JSON.stringify({
          nextNumber: num,
          sector: syncSector,
          type: syncType,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await readJson<QueueSyncBody>(res);

      if (!res.ok) throw new Error(data.error);

      toast.add({
        title: data.message || `Próxima senha: ${data.numberStr}`,
        type: 'success',
      });
      setSyncNumber('');
    } catch (error) {
      toast.add({
        title: errorMessage(error, 'Erro ao sincronizar senha.'),
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className={sectionStyle}>
      <div className={sectionTitleStyle}>
        <div>
          <p className={sectionEyebrowStyle}>CONTROLE</p>
          <h2 className={`font-bold ${sectionHeadingStyle}`}>
            Sincronizar senhas
          </h2>
        </div>
      </div>

      <p className="mb-4 text-[13px] leading-normal text-[#5a7a8a]">
        Pule para um número específico de senha. Útil quando senhas são perdidas
        ou não aparecem nos monitores.
      </p>

      {!canSync && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Permissão ausente</AlertTitle>
          <AlertDescription>
            Sua sessão não tem a permissão <strong>filas.sincronizar</strong>.
          </AlertDescription>
        </Alert>
      )}

      {canSync && (
        <form className="mt-4" onSubmit={(e) => void handleSync(e)}>
          <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <FilterGroup label="Setor">
              <Select
                value={syncSector}
                onValueChange={(v) => v !== null && setSyncSector(v)}
                items={Object.fromEntries(
                  syncSectors.map((s) => [s.id, s.name]),
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Setores</SelectLabel>

                    {syncSectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FilterGroup>

            <FilterGroup label="Tipo">
              <Select
                value={syncType}
                onValueChange={(v) => v !== null && setSyncType(v)}
                items={{
                  [CALL_TYPES.NORMAL]: 'Normal',
                  [CALL_TYPES.PREFERENCIAL]: 'Preferencial',
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Tipos de Fila</SelectLabel>
                    <SelectItem value={CALL_TYPES.NORMAL}>Normal</SelectItem>
                    <SelectItem value={CALL_TYPES.PREFERENCIAL}>
                      Preferencial
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FilterGroup>

            <FilterGroup label="Próximo número">
              <Input
                type="number"
                min="1"
                max="999"
                value={syncNumber}
                onChange={(e) => setSyncNumber(e.target.value)}
                placeholder="Ex: 045"
                required
              />
            </FilterGroup>

            <Button
              type="submit"
              disabled={syncing || !syncNumber}
              className="mb-px self-end"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              account from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
