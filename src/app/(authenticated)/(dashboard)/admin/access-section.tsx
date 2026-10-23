'use client';

import type {
  LucideIcon} from 'lucide-react';
import type {
  RoleSaveBody,
  RolesListBody,
  SuccessBody,
  UserSaveBody,
  UsersListBody,
} from '@/shared/types/api';
import type { RoleRecord, UserRecord } from '@/shared/types/domain';

import {
  Check,
  ChevronDown,
  Eye,
  Headset,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  sectionEyebrowStyle,
  sectionHeadingStyle,
  sectionStyle,
  sectionTitleStyle,
} from '@/app/(authenticated)/(dashboard)/admin/admin-styles';
import { cn } from '@/client/utils';
import { FilterGroup } from '@/components/filter-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  getSector,
  SECTORS,
  USERNAME_REGEX,
  USERNAME_REGEX_LABEL,
} from '@/shared/constants';
import { errorMessage } from '@/shared/errors';
import { readJson } from '@/shared/json';
import {
  ALL_PERMISSIONS,
  computeEffectivePermissions,
  PERMISSION_GROUPS,
  ROLES_MANAGE,
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
} from '@/shared/permissions';
import { useCan } from '@/stores/use-session-store';

const INHERIT = 'inherit';
const GRANT = 'grant';
const DENY = 'deny';

const EMPTY_USER_FORM = {
  active: true,
  full_name: '',
  password: '',
  role_id: '',
  sector_id: '',
  username: '',
};

const EMPTY_ROLE_FORM = { name: '', built_in: false, description: '', key: '' };

/* ── classes locais desta seção (as comuns vêm de ./admin-styles) ── */

/* Formulários: agora dentro de Dialog — o card `.userForm` (fundo, borda e
   margens) some com o diálogo; campos e matriz mantêm o visual exato. */
const formRowStyle =
  'mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4';
const permMatrixStyle =
  'mb-[18px] rounded-[10px] border border-[#dde9ed] bg-[#f9fcfe] p-[18px]';
const permMatrixTitleStyle =
  'flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold uppercase tracking-[0.5px] text-[#416477]';
const permGroupStyle = 'mb-4';
const permGroupTitleStyle =
  'mb-2 text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#7a9aad]';
/* No mobile a permissão e o seletor Herdar/Conceder/Negar empilham: lado a
   lado o trio de botões não cabia na largura do diálogo e o "Negar"
   ficava cortado. */
const permRowStyle =
  'flex flex-col items-stretch justify-between gap-2 border-b border-dashed border-[#eaf1f4] py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5';
const permOnStyle =
  'inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1c7c4a]';
const permOffStyle =
  'inline-flex items-center gap-1.5 text-[13px] text-[#9ab0bd]';
const permCheckStyle =
  'flex cursor-pointer items-center gap-2 py-1 text-[13px] text-[#416477]';
const formActionsStyle = 'flex gap-2.5 justify-end';

/* Tabelas e estados de lista. */
const usersTableStyle = 'mt-3 w-full max-w-full';
const loadingMsgStyle = 'mt-5 text-[13px] text-[#7a9aad]';
const emptyMsgStyle = 'p-6 text-center text-[13px] text-[#7a9aad]';
const roleDescriptionStyle =
  'mt-[3px] text-[12px] font-normal tracking-normal text-[#7a9aad]';

/* Cartões (mobile): a lista vira cartões empilhados abaixo de `xl`,
   porque a tabela de 7 colunas não cabe na largura útil da tela com a
   sidebar aberta e o scroll horizontal escondia os botões de ação. */
const cardListStyle = 'mt-3 flex flex-col gap-3 xl:hidden';
const listCardStyle = 'rounded-[10px] border border-[#dde9ed] bg-white p-3.5';
const cardActionsStyle = 'mt-3 flex gap-2 border-t border-[#eaf1f4] pt-3';

/** Rótulo → valor dentro do cartão mobile. */
const cardFieldStyle = 'min-w-0 flex-1';
const cardFieldLabelStyle =
  'block text-[10px] font-extrabold uppercase tracking-[1px] text-[#7895a3]';
const cardFieldValueStyle = 'mt-0.5 block text-[13px] text-[#23445b]';

const ROLE_CONFIG: Record<string, { className: string; icon: LucideIcon; }> = {
  admin: {
    className: 'bg-[#fef3e6] text-[#c97a0e]',
    icon: ShieldCheck,
  },
  attendant: {
    className: 'bg-[#e6f4fb] text-[#1678a0]', // ou sua variável badgeAttendantStyle
    icon: Headset,
  },
};

const DEFAULT_ROLE_CONFIG = {
  className: 'bg-gray-100 text-gray-700',
  icon: UserCheck,
};

/**
 * Seção "Usuários e Permissões" da área de administração.
 * Duas abas:
 *  - Usuários: CRUD + cargo/setor/situação + overrides por usuário
 *    (conceder/negar permissão além do cargo);
 *  - Cargos: CRUD de cargos + matriz de permissões (Telas/Ações/Escopo).
 * Os cargos built-in (Administrador/Atendente) são somente leitura.
 * Formulários abrem em Dialog e as exclusões pedem confirmação em
 * AlertDialog (antes, tudo era `window.confirm`).
 */
export function AccessSection() {
  const canView = useCan(USERS_VIEW);
  const canCreate = useCan(USERS_CREATE);
  const canEdit = useCan(USERS_EDIT);
  const canDelete = useCan(USERS_DELETE);
  const canManageRoles = useCan(ROLES_MANAGE);

  const [tab, setTab] = useState('usuarios');
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── formulário de usuário ── */
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<null | string>(null);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  // permission → INHERIT | GRANT | DENY
  const [overrides, setOverrides] = useState<Record<string, OverrideMode>>({});

  /* ── formulário de cargo ── */
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<null | string>(null);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  // `Set<string>` de propósito: cargo e usuário trazem strings do banco e
  // precisam ser filtrados sem cast (mesma leitura de permissions.ts).
  const [rolePerms, setRolePerms] = useState<Set<string>>(() => new Set());

  /* ── confirmações de exclusão (antes `window.confirm`) ── */
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserRecord | null>(
    null,
  );
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRecord | null>(
    null,
  );

  useEffect(() => {
    if (!canView) return;
    void loadRoles();
    void loadUsers();
  }, [canView]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await readJson<UsersListBody>(res);
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users || []);
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao carregar usuários'));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const res = await fetch('/api/roles');
      const data = await readJson<RolesListBody>(res);
      if (!res.ok) throw new Error(data.error);
      setRoles(data.roles || []);
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao carregar cargos'));
    }
  }

  /* ─────────── Usuários: abrir formulários ─────────── */

  function openCreateUser() {
    const attendant = roles.find((r) => r.key === 'attendant');
    setEditingUserId(null);
    setUserForm({ ...EMPTY_USER_FORM, role_id: attendant?.id || '' });
    setOverrides({});
    setShowUserForm(true);
  }

  function openEditUser(user: UserRecord) {
    setEditingUserId(user.id);
    setUserForm({
      active: user.active !== false,
      full_name: user.full_name || '',
      password: '',
      role_id: user.role_id || '',
      sector_id: user.sector_id || '',
      username: user.username || '',
    });
    const map: Record<string, OverrideMode> = {};
    for (const row of user.permissions || []) {
      map[row.permission] = row.granted ? GRANT : DENY;
    }
    setOverrides(map);
    setShowUserForm(true);
  }

  function closeUserForm() {
    setShowUserForm(false);
    setEditingUserId(null);
    setUserForm(EMPTY_USER_FORM);
    setOverrides({});
  }

  async function handleUserSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const permissionRows = Object.entries(overrides)
        .filter(([, mode]) => mode !== INHERIT)
        .map(([permission, mode]) => ({
          granted: mode === GRANT,
          permission,
        }));

      const res = editingUserId
        ? await fetch('/api/users', {
            body: JSON.stringify({
              id: editingUserId,
              full_name: userForm.full_name,
              // senha só entra quando preenchida (mantém a atual caso contrário)
              ...(userForm.password ? { password: userForm.password } : {}),
              active: userForm.active,
              permissions: permissionRows,
              role_id: userForm.role_id,
              sector_id: userForm.sector_id || null,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          })
        : await fetch('/api/users', {
            body: JSON.stringify({
              active: userForm.active,
              full_name: userForm.full_name,
              password: userForm.password,
              permissions: permissionRows,
              role_id: userForm.role_id,
              sector_id: userForm.sector_id || null,
              username: userForm.username,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });

      const data = await readJson<UserSaveBody>(res);
      if (!res.ok) throw new Error(data.error);

      toast.success(
        editingUserId
          ? 'Usuário atualizado com sucesso.'
          : `Usuário ${userForm.full_name} criado com sucesso!`,
      );
      closeUserForm();
      await loadUsers();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao salvar usuário'));
    } finally {
      setLoading(false);
    }
  }

  /* Roda depois da confirmação no AlertDialog — o clique em Excluir só
     guarda o alvo em `deleteUserTarget`. */
  async function confirmDeleteUser() {
    const target = deleteUserTarget;
    if (!target) return;
    setDeleteUserTarget(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users?id=${target.id}`, {
        method: 'DELETE',
      });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      toast.success(`Usuário ${target.full_name} excluído com sucesso.`);
      await loadUsers();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao excluir usuário'));
    } finally {
      setLoading(false);
    }
  }

  /* ─────────── Cargos: abrir formulários ─────────── */

  function openCreateRole() {
    setEditingRoleId(null);
    setRoleForm(EMPTY_ROLE_FORM);
    setRolePerms(new Set());
    setShowRoleForm(true);
  }

  function openEditRole(role: RoleRecord) {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      built_in: role.built_in,
      description: role.description || '',
      key: role.key,
    });
    setRolePerms(new Set(role.permissions));
    setShowRoleForm(true);
  }

  function closeRoleForm() {
    setShowRoleForm(false);
    setEditingRoleId(null);
    setRoleForm(EMPTY_ROLE_FORM);
    setRolePerms(new Set());
  }

  function toggleRolePermission(permission: string) {
    setRolePerms((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function handleRoleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: roleForm.name,
        description: roleForm.description || null,
        permissions: [...rolePerms],
      };
      const res = editingRoleId
        ? await fetch('/api/roles', {
            body: JSON.stringify({ id: editingRoleId, ...payload }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          })
        : await fetch('/api/roles', {
            body: JSON.stringify({ key: roleForm.key, ...payload }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });
      const data = await readJson<RoleSaveBody>(res);
      if (!res.ok) throw new Error(data.error);

      toast.success(editingRoleId ? 'Cargo atualizado.' : 'Cargo criado.');
      closeRoleForm();
      await loadRoles();
      await loadUsers();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao salvar cargo'));
    } finally {
      setLoading(false);
    }
  }

  /* Mesmo fluxo do usuário: alvo em `deleteRoleTarget` + AlertDialog. */
  async function confirmDeleteRole() {
    const target = deleteRoleTarget;
    if (!target) return;
    setDeleteRoleTarget(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/roles?id=${target.id}`, {
        method: 'DELETE',
      });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      toast.success('Cargo excluído.');
      await loadRoles();
      await loadUsers();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao excluir cargo'));
    } finally {
      setLoading(false);
    }
  }

  /* ─────────── helpers de render ─────────── */

  const selectedRole = roles.find((r) => r.id === userForm.role_id);
  const effectivePerms = computeEffectivePermissions(
    selectedRole?.permissions ?? [],
    Object.entries(overrides)
      .filter(([, mode]) => mode !== INHERIT)
      .map(([permission, mode]) => ({ granted: mode === GRANT, permission })),
  );

  const roleUsersCount = (roleId: string) =>
    users.filter((u) => u.role_id === roleId).length;

  if (!canView) return null;

  return (
    <section className={sectionStyle}>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className={sectionTitleStyle}>
          <div>
            <p className={sectionEyebrowStyle}>ACESSO</p>
            <h2 className={`font-bold ${sectionHeadingStyle}`}>
              Usuários e permissões
            </h2>
          </div>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="usuarios" className="flex-1 sm:flex-none">
              Usuários
            </TabsTrigger>
            <TabsTrigger value="cargos" className="flex-1 sm:flex-none">
              Cargos e permissões
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ══════════ ABA USUÁRIOS ══════════ */}
        <TabsContent value="usuarios">
          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="text-sm font-medium">Usuários cadastrados</h3>
            </div>
            {canCreate && !showUserForm && (
              <Button onClick={openCreateUser}>
                <Plus data-icon="inline-start" /> Novo usuário
              </Button>
            )}
          </div>

          <Dialog
            open={showUserForm}
            onOpenChange={(open) => {
              if (!open) closeUserForm();
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingUserId ? 'Editar usuário' : 'Novo usuário'}
                </DialogTitle>
              </DialogHeader>
              {/* `min-w-0` impede que a matriz de permissões (larga demais
                  para o diálogo estreito) estoure a coluna do grid do
                  DialogContent — sem isso o diálogo ganhava scroll
                  horizontal no mobile. */}
              <form
                onSubmit={(e) => void handleUserSubmit(e)}
                className="min-w-0"
              >
                <div className={formRowStyle}>
                  <FilterGroup label="Usuário">
                    <Input
                      type="text"
                      value={userForm.username}
                      onChange={(e) =>
                        setUserForm({ ...userForm, username: e.target.value })
                      }
                      placeholder="nome.sobrenome"
                      pattern={USERNAME_REGEX.source}
                      title={USERNAME_REGEX_LABEL}
                      disabled={!!editingUserId}
                      required={!editingUserId}
                    />
                  </FilterGroup>
                  <FilterGroup
                    label={
                      editingUserId
                        ? 'Senha (deixe em branco para manter)'
                        : 'Senha'
                    }
                  >
                    <PasswordInput
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm({ ...userForm, password: e.target.value })
                      }
                      placeholder="••••••••"
                      required={!editingUserId}
                    />
                  </FilterGroup>
                </div>

                <div className={formRowStyle}>
                  <FilterGroup label="Nome completo">
                    <Input
                      type="text"
                      value={userForm.full_name}
                      onChange={(e) =>
                        setUserForm({ ...userForm, full_name: e.target.value })
                      }
                      placeholder="Nome Sobrenome"
                      disabled={userForm.username === 'admin'}
                      required
                    />
                  </FilterGroup>
                  <FilterGroup label="Cargo">
                    <Select
                      value={userForm.role_id || null}
                      onValueChange={(v) =>
                        setUserForm({ ...userForm, role_id: v ?? '' })
                      }
                      items={Object.fromEntries(
                        roles.map((r) => [r.id, r.name]),
                      )}
                      disabled={userForm.username === 'admin'}
                      required
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Cargos</SelectLabel>

                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FilterGroup>
                  <FilterGroup label="Setor (opcional)">
                    <Select
                      value={userForm.sector_id || null}
                      onValueChange={(v) =>
                        setUserForm({ ...userForm, sector_id: v ?? '' })
                      }
                      items={{
                        null: 'Nenhum',
                        ...Object.fromEntries(
                          Object.values(SECTORS).map((s) => [s.id, s.name]),
                        ),
                      }}
                      disabled={userForm.username === 'admin'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Setores</SelectLabel>

                          <SelectItem value={null}>Nenhum</SelectItem>

                          {Object.values(SECTORS).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FilterGroup>
                  <FilterGroup label="Situação">
                    <Select
                      value={userForm.active ? '1' : '0'}
                      onValueChange={(v) =>
                        setUserForm({ ...userForm, active: v === '1' })
                      }
                      items={{ '0': 'Inativo', '1': 'Ativo' }}
                      disabled={userForm.username === 'admin'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Situação</SelectLabel>
                          <SelectItem value="1">Ativo</SelectItem>
                          <SelectItem value="0">Inativo</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FilterGroup>
                </div>

                <Collapsible className={permMatrixStyle}>
                  <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <p className={permMatrixTitleStyle}>
                      Permissões individuais — valem além do cargo
                      <Badge variant="outline" className="ml-2 shrink-0">
                        {effectivePerms.length}/{ALL_PERMISSIONS.length}{' '}
                        efetivas
                      </Badge>
                    </p>

                    <ChevronDown
                      size={16}
                      className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                    />
                  </CollapsibleTrigger>

                  <CollapsibleContent className="pt-3">
                    <Tabs
                      defaultValue={PERMISSION_GROUPS[0]?.key}
                      className="w-full"
                    >
                      {/* Barra de Seleção das Abas — no mobile os três
                          grupos quebram em duas linhas (rolar uma lista de
                          abas escondida não é descobrível). */}
                      <TabsList className="flex h-auto! w-full flex-wrap justify-start rounded-md! sm:grid sm:h-8! sm:grid-cols-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const activeInGroup = group.items.filter((item) =>
                            effectivePerms.includes(item.permission),
                          ).length;

                          return (
                            <TabsTrigger
                              key={group.key}
                              value={group.key}
                              className="flex-none gap-2 rounded-md! text-xs sm:flex-1"
                            >
                              {group.label}
                              <Badge
                                variant="secondary"
                                className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold"
                              >
                                {activeInGroup}/{group.items.length}
                              </Badge>
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>

                      {/* Conteúdo de Cada Aba */}
                      {PERMISSION_GROUPS.map((group) => (
                        <TabsContent
                          key={group.key}
                          value={group.key}
                          className="mt-3 space-y-2"
                        >
                          {group.items.map((item) => {
                            const mode = overrides[item.permission] ?? INHERIT;
                            const effective = effectivePerms.includes(
                              item.permission,
                            );

                            return (
                              <div
                                key={item.permission}
                                className={permRowStyle}
                              >
                                <span
                                  className={
                                    effective ? permOnStyle : permOffStyle
                                  }
                                >
                                  {effective ? (
                                    <Check size={13} />
                                  ) : (
                                    <Minus size={13} />
                                  )}
                                  {item.label}
                                </span>

                                <ToggleGroup
                                  variant="outline"
                                  size="sm"
                                  value={[mode]}
                                  onValueChange={(values) => {
                                    const next = values[0];
                                    if (
                                      next !== undefined &&
                                      isOverrideMode(next)
                                    ) {
                                      setOverrides({
                                        ...overrides,
                                        [item.permission]: next,
                                      });
                                    }
                                  }}
                                  className={cn(
                                    'w-full sm:w-fit sm:min-w-47.5',
                                    userForm.username === 'admin' && 'hidden',
                                  )}
                                >
                                  <ToggleGroupItem
                                    value={INHERIT}
                                    className="flex-1 text-xs hover:brightness-95 data-pressed:brightness-95 sm:flex-none"
                                  >
                                    Herdar
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value={GRANT}
                                    className="flex-1 text-xs hover:brightness-95 data-pressed:brightness-95 sm:flex-none"
                                  >
                                    Conceder
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value={DENY}
                                    className="flex-1 text-xs hover:brightness-95 data-pressed:brightness-95 sm:flex-none"
                                  >
                                    Negar
                                  </ToggleGroupItem>
                                </ToggleGroup>
                              </div>
                            );
                          })}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CollapsibleContent>
                </Collapsible>

                <div className={formActionsStyle}>
                  <Button type="submit" disabled={loading}>
                    {loading
                      ? 'Salvando…'
                      : (editingUserId
                        ? 'Salvar alterações'
                        : 'Criar usuário')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeUserForm}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className={usersTableStyle}>
            {loading && <p className={loadingMsgStyle}>Carregando…</p>}
            {!loading && users.length === 0 && (
              <p className={emptyMsgStyle}>Nenhum usuário cadastrado.</p>
            )}
            {!loading && users.length > 0 && (
              <>
                {/* Tabela — a partir de `xl` (1280px), onde as 7 colunas
                    cabem na largura útil com a sidebar aberta. O padding
                    das células é apertado de propósito: a coluna "Ações"
                    é a última e não pode ficar fora da tela. */}
                <Table className="hidden xl:table [&_td]:px-1.5 [&_th]:px-1.5">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="whitespace-normal">
                        Permissões extras
                      </TableHead>
                      {/* Coluna "Ações" fixa: se um nome longo empurrar a
                          tabela, os botões continuam à vista. */}
                      <TableHead className="sticky right-0 z-10 bg-white">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.username || '—'}</TableCell>
                        <TableCell>{u.full_name}</TableCell>
                        <TableCell>
                          <RoleBadge
                            role={{ name: u.role_name!, key: u.role! }}
                          />
                        </TableCell>
                        <TableCell>
                          {u.sector_id
                            ? getSector(u.sector_id)?.name || u.sector_id
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.active ? 'outline' : 'secondary'}>
                            {u.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <UserPermissionSummary user={u} />
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-white whitespace-nowrap">
                          <UserActions
                            user={u}
                            canEdit={canEdit}
                            canDelete={canDelete}
                            loading={loading}
                            onEdit={() => openEditUser(u)}
                            onDelete={() => setDeleteUserTarget(u)}
                            className="gap-1.5"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Cartões — abaixo de `xl` cada usuário vira um cartão com
                    todos os campos e as ações visíveis (sem scroll
                    horizontal, sem coluna escondida). */}
                <ul className={cardListStyle}>
                  {users.map((u) => (
                    <li key={u.id} className={listCardStyle}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-[#13324d]">
                            {u.username || '—'}
                          </p>
                          <p className="truncate text-[12px] text-[#7590a0]">
                            {u.full_name}
                          </p>
                        </div>

                        <Badge variant={u.active ? 'outline' : 'secondary'}>
                          {u.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      <div className="mt-2.5">
                        <RoleBadge
                          role={{ name: u.role_name!, key: u.role! }}
                        />
                      </div>

                      <div className="mt-3 flex gap-3">
                        <div className={cardFieldStyle}>
                          <span className={cardFieldLabelStyle}>Setor</span>
                          <span className={cardFieldValueStyle}>
                            {u.sector_id
                              ? getSector(u.sector_id)?.name || u.sector_id
                              : '—'}
                          </span>
                        </div>

                        <div className={cardFieldStyle}>
                          <span className={cardFieldLabelStyle}>
                            Permissões extras
                          </span>
                          <span className={cardFieldValueStyle}>
                            <UserPermissionSummary user={u} />
                          </span>
                        </div>
                      </div>

                      <UserActions
                        user={u}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        loading={loading}
                        onEdit={() => openEditUser(u)}
                        onDelete={() => setDeleteUserTarget(u)}
                        className={cardActionsStyle}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </TabsContent>

        {/* ══════════ ABA CARGOS ══════════ */}
        <TabsContent value="cargos">
          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="text-sm font-medium">Cargos</h3>
            </div>
            {canManageRoles && !showRoleForm && (
              <Button onClick={openCreateRole}>
                <Plus data-icon="inline-start" /> Novo cargo
              </Button>
            )}
          </div>

          <Dialog
            open={showRoleForm}
            onOpenChange={(open) => {
              if (!open) closeRoleForm();
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingRoleId ? 'Editar cargo' : 'Novo cargo'}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => void handleRoleSubmit(e)}
                className="min-w-0"
              >
                <div className={formRowStyle}>
                  {!editingRoleId && (
                    <FilterGroup label="Chave">
                      <Input
                        type="text"
                        value={roleForm.key}
                        onChange={(e) =>
                          setRoleForm({ ...roleForm, key: e.target.value })
                        }
                        placeholder="coordenador"
                        pattern="[a-z][a-z0-9-]*"
                        title="Minúsculas, sem espaços (ex.: coordenador)"
                        required
                      />
                    </FilterGroup>
                  )}
                  <FilterGroup label="Nome">
                    <Input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) =>
                        setRoleForm({ ...roleForm, name: e.target.value })
                      }
                      placeholder="Coordenador"
                      disabled={roleForm.built_in}
                      required
                    />
                  </FilterGroup>
                  <FilterGroup label="Descrição">
                    <Textarea
                      value={roleForm.description}
                      onChange={(e) =>
                        setRoleForm({
                          ...roleForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="O que este cargo faz"
                      className="min-h-8"
                    />
                  </FilterGroup>
                </div>

                <div className={permMatrixStyle}>
                  <p className={permMatrixTitleStyle}>
                    Permissões do cargo
                    <Badge variant="outline" className="ml-2">
                      {rolePerms.size}/{ALL_PERMISSIONS.length}
                    </Badge>
                  </p>
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.key} className={permGroupStyle}>
                      <h4 className={permGroupTitleStyle}>{group.label}</h4>
                      {group.items.map((item) => (
                        <label
                          key={item.permission}
                          className={permCheckStyle}
                          onClick={(e) => {
                            e.preventDefault();
                            if (
                              (e.target as Element).closest(
                                '[data-slot="checkbox"]',
                              )
                            )
                              return;
                            if (canManageRoles && !roleForm.built_in)
                              toggleRolePermission(item.permission);
                          }}
                        >
                          <Checkbox
                            checked={rolePerms.has(item.permission)}
                            onCheckedChange={() =>
                              toggleRolePermission(item.permission)
                            }
                            disabled={!canManageRoles || roleForm.built_in}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>

                {canManageRoles && (
                  <div className={formActionsStyle}>
                    <Button type="submit" disabled={loading}>
                      {loading
                        ? 'Salvando…'
                        : (editingRoleId
                          ? 'Salvar cargo'
                          : 'Criar cargo')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeRoleForm}
                    >
                      Fechar
                    </Button>
                  </div>
                )}
              </form>
            </DialogContent>
          </Dialog>

          <div className={usersTableStyle}>
            {roles.length === 0 && (
              <p className={emptyMsgStyle}>Nenhum cargo cadastrado.</p>
            )}
            {roles.length > 0 && (
              <>
                {/* Tabela — a partir de `xl`. */}
                <Table className="hidden xl:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Permissões</TableHead>
                      <TableHead>Usuários</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <RoleBadge role={r} />

                          {r.description && (
                            <div className={roleDescriptionStyle}>
                              {r.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{r.key}</TableCell>
                        <TableCell>
                          {r.permissions.length}/{ALL_PERMISSIONS.length}
                        </TableCell>
                        <TableCell>{roleUsersCount(r.id)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <RoleActions
                            role={r}
                            canManageRoles={canManageRoles}
                            loading={loading}
                            onEdit={() => openEditRole(r)}
                            onDelete={() => setDeleteRoleTarget(r)}
                            className="gap-1.5"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Cartões — abaixo de `xl`. */}
                <ul className={cardListStyle}>
                  {roles.map((r) => (
                    <li key={r.id} className={listCardStyle}>
                      <RoleBadge role={r} />

                      {r.description && (
                        <p className={roleDescriptionStyle}>{r.description}</p>
                      )}

                      <div className="mt-3 flex gap-3">
                        <div className={cardFieldStyle}>
                          <span className={cardFieldLabelStyle}>Chave</span>
                          <span className={cardFieldValueStyle}>{r.key}</span>
                        </div>

                        <div className={cardFieldStyle}>
                          <span className={cardFieldLabelStyle}>
                            Permissões
                          </span>
                          <span className={cardFieldValueStyle}>
                            {r.permissions.length}/{ALL_PERMISSIONS.length}
                          </span>
                        </div>

                        <div className={cardFieldStyle}>
                          <span className={cardFieldLabelStyle}>Usuários</span>
                          <span className={cardFieldValueStyle}>
                            {roleUsersCount(r.id)}
                          </span>
                        </div>
                      </div>

                      <RoleActions
                        role={r}
                        canManageRoles={canManageRoles}
                        loading={loading}
                        onEdit={() => openEditRole(r)}
                        onDelete={() => setDeleteRoleTarget(r)}
                        className={cardActionsStyle}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Confirmações de exclusão — os antigos `window.confirm` ── */}
      <AlertDialog
        open={deleteUserTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteUserTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteUserTarget
                ? `Excluir o usuário "${deleteUserTarget.full_name}"?`
                : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDeleteUser()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteRoleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRoleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteRoleTarget
                ? `Excluir o cargo "${deleteRoleTarget.name}"?`
                : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Usuários com este cargo ficarão órfãos — troque-os antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDeleteRole()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Estado de um override por usuário: herdado do cargo, concedido ou negado. */
type OverrideMode = typeof DENY | typeof GRANT | typeof INHERIT;

/**
 * Guarda o valor do tri-state: o `ToggleGroup` só oferece esses três
 * valores, mas a lib devolve `string` crua — e é o predicado que dá ao
 * `setOverrides` o `OverrideMode` (não um cast).
 */
function isOverrideMode(value: string): value is OverrideMode {
  return value === INHERIT || value === GRANT || value === DENY;
}

/**
 * Botões de ação de um cargo — cargo `built_in` é somente leitura.
 */
function RoleActions({
  canManageRoles,
  className,
  loading,
  onDelete,
  onEdit,
  role,
}: {
  readonly canManageRoles: boolean;
  readonly loading: boolean;
  readonly role: RoleRecord;
  readonly className?: string;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
}) {
  return (
    <div className={cn('flex gap-2', className)}>
      <Button
        variant="outline"
        size="xs"
        className="flex-1 xl:flex-none"
        onClick={onEdit}
        disabled={loading}
      >
        {role.built_in ? <Eye /> : <Pencil />}
        {role.built_in ? 'Visualizar' : 'Editar'}
      </Button>
      {canManageRoles && !role.built_in && (
        <Button
          variant="destructive"
          size="xs"
          className="flex-1 xl:flex-none"
          onClick={onDelete}
          disabled={loading}
        >
          <Trash2 /> Excluir
        </Button>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: Pick<RoleRecord, 'key' | 'name'> }) {
  const roleInfo = ROLE_CONFIG[role.key] || DEFAULT_ROLE_CONFIG;
  const Icon = roleInfo.icon;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 uppercase', roleInfo.className)}
    >
      <Icon /> {role.name}
    </Badge>
  );
}

/**
 * Botões de ação de um usuário — a mesma linha na tabela e no cartão do
 * mobile (o usuário `admin` nunca pode ser excluído).
 */
function UserActions({
  canDelete,
  canEdit,
  className,
  loading,
  onDelete,
  onEdit,
  user,
}: {
  readonly canDelete: boolean;
  readonly canEdit: boolean;
  readonly loading: boolean;
  readonly user: UserRecord;
  readonly className?: string;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
}) {
  const canDeleteUser = canDelete && user.role !== 'admin';
  if (!canEdit && !canDeleteUser) return null;

  return (
    <div className={cn('flex gap-2', className)}>
      {canEdit && (
        <Button
          variant="outline"
          size="xs"
          className="flex-1 xl:flex-none"
          onClick={onEdit}
          disabled={loading}
        >
          <Pencil /> Editar
        </Button>
      )}
      {canDeleteUser && (
        <Button
          variant="destructive"
          size="xs"
          className="flex-1 xl:flex-none"
          onClick={onDelete}
          disabled={loading}
        >
          <Trash2 /> Excluir
        </Button>
      )}
    </div>
  );
}

/**
 * Resumo das permissões individuais do usuário (concedidas/negadas).
 * Compartilhado entre a tabela e o cartão do mobile.
 */
function UserPermissionSummary({ user }: { user: UserRecord }) {
  const grants = (user.permissions || []).filter((p) => p.granted).length;
  const denies = (user.permissions || []).filter((p) => !p.granted).length;

  if (grants + denies === 0) return <>—</>;

  return (
    <>
      {[
        grants ? `${grants} concedida(s)` : null,
        denies ? `${denies} negada(s)` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </>
  );
}
