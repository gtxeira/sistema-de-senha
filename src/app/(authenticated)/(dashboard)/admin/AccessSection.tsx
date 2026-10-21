"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Check,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Headset,
  LucideIcon,
  ChevronDown,
  Eye
} from "lucide-react";
import {
  getSessionSnapshot,
  getServerSessionSnapshot,
  subscribeSession,
} from "@/lib/queue";
import {
  SECTORS,
  USERNAME_REGEX,
  USERNAME_REGEX_LABEL,
  getSector,
} from "@/lib/constants";
import { errorMessage } from "@/lib/repositories/utils";
import { readJson } from "@/lib/json";
import { toast } from "sonner";
import type {
  RolesListBody,
  RoleSaveBody,
  SuccessBody,
  UsersListBody,
  UserSaveBody,
} from "@/types/api";
import type { RoleRecord, UserRecord } from "@/lib/repositories/types";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLES_MANAGE,
  USERS_CREATE,
  USERS_DELETE,
  USERS_EDIT,
  USERS_VIEW,
  computeEffectivePermissions,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FilterGroup } from "@/components/filter-group";
import {
  sectionEyebrowStyle,
  sectionHeadingStyle,
  sectionStyle,
  sectionTitleStyle,
} from "@/app/(authenticated)/(dashboard)/admin/admin-styles";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INHERIT = "inherit";
const GRANT = "grant";
const DENY = "deny";

const EMPTY_USER_FORM = {
  username: "",
  password: "",
  full_name: "",
  role_id: "",
  sector_id: "",
  active: true,
};

const EMPTY_ROLE_FORM = { key: "", name: "", description: "", built_in: false };

/* ── classes locais desta seção (as comuns vêm de ./admin-styles) ── */

/* Formulários: agora dentro de Dialog — o card `.userForm` (fundo, borda e
   margens) some com o diálogo; campos e matriz mantêm o visual exato. */
const formRowStyle =
  "mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4";
const permMatrixStyle =
  "mb-[18px] rounded-[10px] border border-[#dde9ed] bg-[#f9fcfe] p-[18px]";
const permMatrixTitleStyle =
  "flex items-center justify-between gap-3 text-[12px] font-bold uppercase tracking-[0.5px] text-[#416477]";
const permGroupStyle = "mb-4";
const permGroupTitleStyle =
  "mb-2 text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#7a9aad]";
const permRowStyle =
  "flex items-center justify-between gap-3 border-b border-dashed border-[#eaf1f4] py-1.5 last:border-b-0";
const permOnStyle =
  "inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1c7c4a]";
const permOffStyle =
  "inline-flex items-center gap-1.5 text-[13px] text-[#9ab0bd]";
const permCheckStyle =
  "flex cursor-pointer items-center gap-2 py-1 text-[13px] text-[#416477]";
const formActionsStyle = "flex gap-2.5 justify-end";

/* Tabelas e estados de lista. */
const usersTableStyle = "mt-3 w-full max-w-full overflow-x-auto";
const loadingMsgStyle = "mt-5 text-[13px] text-[#7a9aad]";
const emptyMsgStyle = "p-6 text-center text-[13px] text-[#7a9aad]";
const roleDescriptionStyle =
  "mt-[3px] text-[12px] font-normal tracking-normal text-[#7a9aad]";

const ROLE_CONFIG: Record<string, { icon: LucideIcon; className: string }> = {
  admin: {
    icon: ShieldCheck,
    className: 'bg-[#fef3e6] text-[#c97a0e]',
  },
  attendant: {
    icon: Headset,
    className: 'bg-[#e6f4fb] text-[#1678a0]', // ou sua variável badgeAttendantStyle
  },
}

const DEFAULT_ROLE_CONFIG = {
  icon: UserCheck,
  className: 'bg-gray-100 text-gray-700',
}

/** Estado de um override por usuário: herdado do cargo, concedido ou negado. */
type OverrideMode = typeof INHERIT | typeof GRANT | typeof DENY;

/**
 * Guarda o valor do tri-state: o `ToggleGroup` só oferece esses três
 * valores, mas a lib devolve `string` crua — e é o predicado que dá ao
 * `setOverrides` o `OverrideMode` (não um cast).
 */
function isOverrideMode(value: string): value is OverrideMode {
  return value === INHERIT || value === GRANT || value === DENY;
}

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
export default function AccessSection() {
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );

  const canView = hasPermission(session, USERS_VIEW);
  const canCreate = hasPermission(session, USERS_CREATE);
  const canEdit = hasPermission(session, USERS_EDIT);
  const canDelete = hasPermission(session, USERS_DELETE);
  const canManageRoles = hasPermission(session, ROLES_MANAGE);

  const [tab, setTab] = useState("usuarios");
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── formulário de usuário ── */
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  // permission → INHERIT | GRANT | DENY
  const [overrides, setOverrides] = useState<Record<string, OverrideMode>>({});

  /* ── formulário de cargo ── */
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  // `Set<string>` de propósito: cargo e usuário trazem strings do banco e
  // precisam ser filtrados sem cast (mesma leitura de permissions.ts).
  const [rolePerms, setRolePerms] = useState<Set<string>>(() => new Set());

  /* ── confirmações de exclusão (antes `window.confirm`) ── */
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserRecord | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRecord | null>(null);

  useEffect(() => {
    if (!canView) return;
    void loadRoles();
    void loadUsers();
  }, [canView]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await readJson<UsersListBody>(res);
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users || []);
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao carregar usuários"));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const res = await fetch("/api/roles");
      const data = await readJson<RolesListBody>(res);
      if (!res.ok) throw new Error(data.error);
      setRoles(data.roles || []);
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao carregar cargos"));
    }
  }

  /* ─────────── Usuários: abrir formulários ─────────── */

  function openCreateUser() {
    const attendant = roles.find((r) => r.key === "attendant");
    setEditingUserId(null);
    setUserForm({ ...EMPTY_USER_FORM, role_id: attendant?.id || "" });
    setOverrides({});
    setShowUserForm(true);
  }

  function openEditUser(user: UserRecord) {
    setEditingUserId(user.id);
    setUserForm({
      username: user.username || "",
      password: "",
      full_name: user.full_name || "",
      role_id: user.role_id || "",
      sector_id: user.sector_id || "",
      active: user.active !== false,
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
          permission,
          granted: mode === GRANT,
        }));

      const res = editingUserId
        ? await fetch("/api/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingUserId,
              full_name: userForm.full_name,
              // senha só entra quando preenchida (mantém a atual caso contrário)
              ...(userForm.password ? { password: userForm.password } : {}),
              role_id: userForm.role_id,
              sector_id: userForm.sector_id || null,
              active: userForm.active,
              permissions: permissionRows,
            }),
          })
        : await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: userForm.username,
              password: userForm.password,
              full_name: userForm.full_name,
              role_id: userForm.role_id,
              sector_id: userForm.sector_id || null,
              active: userForm.active,
              permissions: permissionRows,
            }),
          });

      const data = await readJson<UserSaveBody>(res);
      if (!res.ok) throw new Error(data.error);

      toast.success(
        editingUserId ? "Usuário atualizado com sucesso." : `Usuário ${userForm.full_name} criado com sucesso!`,
      );
      closeUserForm();
      await loadUsers();
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao salvar usuário"));
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
      const res = await fetch(`/api/users?id=${target.id}`, { method: "DELETE" });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      toast.success(`Usuário ${target.full_name} excluído com sucesso.`);
      await loadUsers();
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao excluir usuário"));
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
      key: role.key,
      name: role.name,
      description: role.description || "",
      built_in: role.built_in,
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
        ? await fetch("/api/roles", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingRoleId, ...payload }),
          })
        : await fetch("/api/roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: roleForm.key, ...payload }),
          });
      const data = await readJson<RoleSaveBody>(res);
      if (!res.ok) throw new Error(data.error);

      toast.success(editingRoleId ? "Cargo atualizado." : "Cargo criado.");
      closeRoleForm();
      await loadRoles();
      await loadUsers();
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao salvar cargo"));
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
      const res = await fetch(`/api/roles?id=${target.id}`, { method: "DELETE" });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      toast.success("Cargo excluído.");
      await loadRoles();
      await loadUsers();
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao excluir cargo"));
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
      .map(([permission, mode]) => ({ permission, granted: mode === GRANT })),
  );

  const roleUsersCount = (roleId: string) =>
    users.filter((u) => u.role_id === roleId).length;

  if (!canView) return null;

  return (
    <section className={sectionStyle}>
      <Tabs value={tab} onValueChange={(v) => setTab(v)} className="w-full">
        <div className={sectionTitleStyle}>
          <div>
            <p className={sectionEyebrowStyle}>ACESSO</p>
            <h2 className={`font-bold ${sectionHeadingStyle}`}>Usuários e permissões</h2>
          </div>
          <TabsList>
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="cargos">Cargos e permissões</TabsTrigger>
          </TabsList>
        </div>

      {/* ══════════ ABA USUÁRIOS ══════════ */}
      <TabsContent value="usuarios">
          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Usuários cadastrados</h3>
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
                  {editingUserId ? "Editar usuário" : "Novo usuário"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => void handleUserSubmit(e)}>
                <div className={formRowStyle}>
                  <FilterGroup label="Usuário">
                    <Input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="nome.sobrenome"
                      pattern={USERNAME_REGEX.source}
                      title={USERNAME_REGEX_LABEL}
                      disabled={!!editingUserId}
                      required={!editingUserId}
                    />
                  </FilterGroup>
                  <FilterGroup label={editingUserId ? "Senha (deixe em branco para manter)" : "Senha"}>
                    <Input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
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
                      onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                      placeholder="Nome Sobrenome"
                      disabled={userForm.username === "admin"}
                      required
                    />
                  </FilterGroup>
                  <FilterGroup label="Cargo">
                    <Select
                      value={userForm.role_id || null}
                      onValueChange={(v) => setUserForm({ ...userForm, role_id: v ?? "" })}
                      items={Object.fromEntries(roles.map((r) => [r.id, r.name]))}
                      disabled={userForm.username === "admin"}
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
                      onValueChange={(v) => setUserForm({ ...userForm, sector_id: v ?? "" })}
                      items={{
                        null: 'Nenhum',
                        ...Object.fromEntries(Object.values(SECTORS).map((s) => [s.id, s.name]))
                      }}
                      disabled={userForm.username === "admin"}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Setores</SelectLabel>

                          <SelectItem value={null}>
                            Nenhum
                          </SelectItem>

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
                      value={userForm.active ? "1" : "0"}
                      onValueChange={(v) => setUserForm({ ...userForm, active: v === "1" })}
                      items={{ "1": "Ativo", "0": "Inativo" }}
                      disabled={userForm.username === "admin"}
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
                  <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <p className={permMatrixTitleStyle}>
                      Permissões individuais — valem além do cargo
                      <Badge variant="outline" className="ml-2">
                        {effectivePerms.length}/{ALL_PERMISSIONS.length} efetivas
                      </Badge>
                    </p>

                    <ChevronDown
                      size={16}
                      className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                    />
                  </CollapsibleTrigger>

                  <CollapsibleContent className="pt-3">
                    <Tabs defaultValue={PERMISSION_GROUPS[0]?.key} className="w-full">
                      {/* Barra de Seleção das Abas */}
                      <TabsList className="grid w-full grid-cols-3 rounded-md!">
                        {PERMISSION_GROUPS.map((group) => {
                          const activeInGroup = group.items.filter((item) =>
                            effectivePerms.includes(item.permission)
                          ).length;

                          return (
                            <TabsTrigger key={group.key} value={group.key} className="gap-2 text-xs rounded-md!">
                              {group.label}
                              <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] font-semibold">
                                {activeInGroup}/{group.items.length}
                              </Badge>
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>

                      {/* Conteúdo de Cada Aba */}
                      {PERMISSION_GROUPS.map((group) => (
                        <TabsContent key={group.key} value={group.key} className="mt-3 space-y-2">
                          {group.items.map((item) => {
                            const mode = overrides[item.permission] ?? INHERIT;
                            const effective = effectivePerms.includes(item.permission);

                            return (
                              <div key={item.permission} className={permRowStyle}>
                              <span className={effective ? permOnStyle : permOffStyle}>
                                {effective ? <Check size={13} /> : <Minus size={13} />}
                                {item.label}
                              </span>

                                <ToggleGroup
                                  variant="outline"
                                  size="sm"
                                  value={[mode]}
                                  onValueChange={(values) => {
                                    const next = values[0];
                                    if (next !== undefined && isOverrideMode(next)) {
                                      setOverrides({
                                        ...overrides,
                                        [item.permission]: next,
                                      });
                                    }
                                  }}
                                  className={cn(
                                    "min-w-47.5",
                                    userForm.username === 'admin' && 'hidden'
                                  )}
                                >
                                  <ToggleGroupItem value={INHERIT} className="text-xs data-pressed:brightness-95 hover:brightness-95">
                                    Herdar
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value={GRANT} className="text-xs data-pressed:brightness-95 hover:brightness-95">
                                    Conceder
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value={DENY} className="text-xs data-pressed:brightness-95 hover:brightness-95">
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
                    {loading ? "Salvando…" : editingUserId ? "Salvar alterações" : "Criar usuário"}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeUserForm}>
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
              <Table className="overflow-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Permissões extras</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const grants = (u.permissions || []).filter((p) => p.granted).length;
                    const denies = (u.permissions || []).filter((p) => !p.granted).length;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>{u.username || "—"}</TableCell>
                        <TableCell>{u.full_name}</TableCell>
                        <TableCell>
                          <RoleBadge role={ { key: u.role!, name: u.role_name! } } />
                        </TableCell>
                        <TableCell>{u.sector_id ? getSector(u.sector_id)?.name || u.sector_id : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={u.active ? "outline" : "secondary"}>
                            {u.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {grants + denies === 0
                            ? "—"
                            : [
                                grants ? `${grants} concedida(s)` : null,
                                denies ? `${denies} negada(s)` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="xs"
                              className="mr-1.5"
                              onClick={() => openEditUser(u)}
                              disabled={loading}
                            >
                              <Pencil /> Editar
                            </Button>
                          )}
                          {canDelete && u.role !== "admin" && (
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => setDeleteUserTarget(u)}
                              disabled={loading}
                            >
                              <Trash2 /> Excluir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
      </TabsContent>

      {/* ══════════ ABA CARGOS ══════════ */}
      <TabsContent value="cargos">
          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Cargos</h3>
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
                  {editingRoleId ? "Editar cargo" : "Novo cargo"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => void handleRoleSubmit(e)}>
                <div className={formRowStyle}>
                  {!editingRoleId && (
                    <FilterGroup label="Chave">
                      <Input
                        type="text"
                        value={roleForm.key}
                        onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
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
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      placeholder="Coordenador"
                      disabled={roleForm.built_in}
                      required
                    />
                  </FilterGroup>
                  <FilterGroup label="Descrição">
                    <Textarea
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
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
                            if ((e.target as Element).closest('[data-slot="checkbox"]')) return;
                            if (canManageRoles && !roleForm.built_in) toggleRolePermission(item.permission);
                          }}
                        >
                          <Checkbox
                            checked={rolePerms.has(item.permission)}
                            onCheckedChange={() => toggleRolePermission(item.permission)}
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
                      {loading ? "Salvando…" : editingRoleId ? "Salvar cargo" : "Criar cargo"}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeRoleForm}>
                      Fechar
                    </Button>
                  </div>
                )}
              </form>
            </DialogContent>
          </Dialog>

          <div className={usersTableStyle}>
            {roles.length === 0 && <p className={emptyMsgStyle}>Nenhum cargo cadastrado.</p>}
            {roles.length > 0 && (
              <Table className="w-full max-w-full overflow-x-auto">
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
                          <div className={roleDescriptionStyle}>{r.description}</div>
                        )}
                      </TableCell>
                      <TableCell>{r.key}</TableCell>
                      <TableCell>
                        {r.permissions.length}/{ALL_PERMISSIONS.length}
                      </TableCell>
                      <TableCell>{roleUsersCount(r.id)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="xs"
                          className="mr-1.5"
                          onClick={() => openEditRole(r)}
                          disabled={loading}
                        >
                          {r.built_in ? <Eye /> : <Pencil />}
                          {r.built_in ? "Visualizar" : "Editar"}
                        </Button>
                        {canManageRoles && !r.built_in && (
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => setDeleteRoleTarget(r)}
                            disabled={loading}
                          >
                            <Trash2 /> Excluir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              {deleteUserTarget ? `Excluir o usuário "${deleteUserTarget.full_name}"?` : ""}
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
              {deleteRoleTarget ? `Excluir o cargo "${deleteRoleTarget.name}"?` : ""}
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

function RoleBadge({ role }: { role: Pick<RoleRecord, 'name' | 'key'> }) {
  const roleInfo = ROLE_CONFIG[role.key] || DEFAULT_ROLE_CONFIG
  const Icon = roleInfo.icon

  return (
    <Badge variant="outline" className={cn("gap-1 uppercase", roleInfo.className)}>
      <Icon /> {role.name}
    </Badge>
  )
}