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
  ChevronDown
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  alertBoxStyle,
  fieldLabelStyle,
  fieldStyle,
  sectionEyebrowStyle,
  sectionHeadingStyle,
  sectionStyle,
  sectionTitleStyle,
} from "./admin-styles";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
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

const EMPTY_ROLE_FORM = { key: "", name: "", description: "" };

/* ── classes locais desta seção (as comuns vêm de ./admin-styles) ── */

const tabBarStyle = "flex shrink-0 gap-2";
/* o hover fica na variante escolhida: as duas abas têm fundo próprio e
   competiriam no mesmo `hover:bg-*` */
const tabBaseStyle =
  "cursor-pointer rounded-[8px] border-[1.5px] px-4 py-[9px] text-[13px] font-bold text-[#416477] transition-all duration-[150ms]";
const tabInactiveStyle = `${tabBaseStyle} border-[#dde9ed] bg-[#f1f7fa] hover:bg-[#e6f2f8]`;
const tabActiveStyle = `${tabBaseStyle} border-[#1678a0] bg-[#1678a0] text-white`;
const addUserBtnStyle =
  "flex cursor-pointer items-center gap-0.5 rounded-[8px] border-current bg-[#1678a0] px-[18px] py-2.5 text-[13px] font-bold text-white transition-[background-color] duration-[150ms] hover:bg-[#1389b8]";

/* Formulários: agora dentro de Dialog — o card `.userForm` (fundo, borda e
   margens) some com o diálogo; campos e matriz mantêm o visual exato. */
const formRowStyle =
  "mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4";
const permMatrixStyle =
  "mb-[18px] rounded-[10px] border border-[#dde9ed] bg-[#f9fcfe] p-[18px]";
const permMatrixTitleStyle =
  "flex items-center justify-between gap-3 text-[12px] font-bold uppercase tracking-[0.5px] text-[#416477]";
const effectiveCountStyle =
  "rounded-[6px] bg-[#e6f4fb] px-2.5 py-1 text-[11px] text-[#1678a0]";
const permGroupStyle = "mb-4";
const permGroupTitleStyle =
  "mb-2 text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#7a9aad]";
const permRowStyle =
  "flex items-center justify-between gap-3 border-b border-dashed border-[#eaf1f4] py-1.5 last:border-b-0";
const permOnStyle =
  "inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1c7c4a]";
const permOffStyle =
  "inline-flex items-center gap-1.5 text-[13px] text-[#9ab0bd]";
const triStateStyle =
  "min-w-[150px] rounded-[6px] border-[1.5px] border-[#cddde5] bg-white px-2 py-1.5 text-[12px] text-[#416477] outline-none transition-[border-color] duration-[150ms] focus:border-[#1678a0]";
const permCheckStyle =
  "flex cursor-pointer items-center gap-2 py-1 text-[13px] text-[#416477]";
const formActionsStyle = "flex gap-2.5 justify-end";
const submitBtnStyle =
  "cursor-pointer rounded-[8px] border-current bg-[#1678a0] px-6 py-3 text-sm font-bold text-white transition-[background-color] duration-[150ms] enabled:hover:bg-[#1389b8] disabled:cursor-wait disabled:opacity-50";
const cancelBtnStyle =
  "cursor-pointer rounded-[8px] border-[1.5px] border-[#cddde5] bg-[#f1f7fa] px-6 py-3 text-[13px] font-bold text-[#416477] transition-[background-color] duration-[150ms] enabled:hover:bg-[#e6f2f8]";

/* Tabelas e estados de lista. */
const usersTableStyle = "mt-3";
const loadingMsgStyle = "mt-5 text-[13px] text-[#7a9aad]";
const emptyMsgStyle = "p-6 text-center text-[13px] text-[#7a9aad]";
const tableStyle =
  "w-full border-collapse overflow-hidden rounded-[10px] border border-[#dde9ed] bg-white";
const theadStyle = "bg-[#f4f8fb]";
const thStyle =
  "border-b border-[#dde9ed] px-4 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#416477]";
const tdStyle =
  "border-b border-[#f0f5f8] px-4 py-3.5 text-[13px] text-[#0d2d47]";
/* `tbody tr:last-child td { border-bottom: none }` */
const tbodyStyle = "[&>tr:last-child>td]:border-b-0";
const badgeBaseStyle =
  "inline-flex items-center gap-0.5 rounded-[6px] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.3px]";
const badgeUserActiveStyle = `${badgeBaseStyle} bg-[#e6f4fb] text-[#1678a0]`;
const badgeUserInactiveStyle = `${badgeBaseStyle} bg-[#fef3e6] text-[#c97a0e]`;
/* td não vira flex: as utilidades ficam em cada botão e o espaçamento entre
   irmãos, no próprio td */
const rowActionsStyle = "whitespace-nowrap [&>button+button]:ml-1.5";
const rowBtnBaseStyle =
  "inline-flex cursor-pointer items-center gap-[5px] rounded-[6px] px-3 py-1.5 text-[12px] font-bold";
const editBtnStyle = `${rowBtnBaseStyle} border border-[#bfe3f3] bg-[#e6f4fb] text-[#1678a0] enabled:hover:bg-[#d3edfa] disabled:cursor-wait disabled:opacity-50`;
const deleteBtnStyle = `${rowBtnBaseStyle} border border-[#f5c6c2] bg-[#fdecea] text-[#b33a2e] transition-[background-color] duration-[150ms] enabled:hover:bg-[#fcded9] disabled:cursor-wait disabled:opacity-50`;
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
 * Guarda o `e.target.value` do tri-state: o `<select>` só oferece esses três
 * valores, mas a DOM devolve `string` crua — e é o predicado que dá ao
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
  const [message, setMessage] = useState("");

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
      setMessage(errorMessage(err, "Erro ao carregar usuários"));
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
      setMessage(errorMessage(err, "Erro ao carregar cargos"));
    }
  }

  /* ─────────── Usuários: abrir formulários ─────────── */

  function openCreateUser() {
    const attendant = roles.find((r) => r.key === "attendant");
    setEditingUserId(null);
    setUserForm({ ...EMPTY_USER_FORM, role_id: attendant?.id || "" });
    setOverrides({});
    setShowUserForm(true);
    setMessage("");
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
    setMessage("");
  }

  function closeUserForm() {
    setShowUserForm(false);
    setEditingUserId(null);
    setUserForm(EMPTY_USER_FORM);
    setOverrides({});
  }

  async function handleUserSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
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

      setMessage(
        editingUserId ? "Usuário atualizado com sucesso." : `Usuário ${userForm.full_name} criado com sucesso!`,
      );
      closeUserForm();
      await loadUsers();
    } catch (err) {
      setMessage(errorMessage(err, "Erro ao salvar usuário"));
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
    setMessage("");
    try {
      const res = await fetch(`/api/users?id=${target.id}`, { method: "DELETE" });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      setMessage(`Usuário ${target.full_name} excluído com sucesso.`);
      await loadUsers();
    } catch (err) {
      setMessage(errorMessage(err, "Erro ao excluir usuário"));
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
    setMessage("");
  }

  function openEditRole(role: RoleRecord) {
    setEditingRoleId(role.id);
    setRoleForm({
      key: role.key,
      name: role.name,
      description: role.description || "",
    });
    setRolePerms(new Set(role.permissions));
    setShowRoleForm(true);
    setMessage("");
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
    setMessage("");
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

      setMessage(editingRoleId ? "Cargo atualizado." : "Cargo criado.");
      closeRoleForm();
      await loadRoles();
      await loadUsers();
    } catch (err) {
      setMessage(errorMessage(err, "Erro ao salvar cargo"));
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
    setMessage("");
    try {
      const res = await fetch(`/api/roles?id=${target.id}`, { method: "DELETE" });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      setMessage("Cargo excluído.");
      await loadRoles();
      await loadUsers();
    } catch (err) {
      setMessage(errorMessage(err, "Erro ao excluir cargo"));
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

  /* Com um Dialog aberto o alerta da seção ficaria escondido atrás do
     overlay — aí a mensagem aparece dentro do formulário. */
  const messageOutsideForm = !showUserForm && !showRoleForm;

  if (!canView) return null;

  return (
    <section className={sectionStyle}>
      <div className={sectionTitleStyle}>
        <div>
          <p className={sectionEyebrowStyle}>ACESSO</p>
          <h2 className={`font-bold ${sectionHeadingStyle}`}>Usuários e permissões</h2>
        </div>
        <div className={tabBarStyle}>
          <button
            type="button"
            className={tab === "usuarios" ? tabActiveStyle : tabInactiveStyle}
            onClick={() => setTab("usuarios")}
          >
            Usuários
          </button>
          <button
            type="button"
            className={tab === "cargos" ? tabActiveStyle : tabInactiveStyle}
            onClick={() => setTab("cargos")}
          >
            Cargos e permissões
          </button>
        </div>
      </div>

      {message && messageOutsideForm && <div className={alertBoxStyle}>{message}</div>}

      {/* ══════════ ABA USUÁRIOS ══════════ */}
      {tab === "usuarios" && (
        <>
          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Usuários cadastrados</h3>
            </div>
            {canCreate && !showUserForm && (
              <button type="button" className={addUserBtnStyle} onClick={openCreateUser}>
                <Plus size={14} /> Novo usuário
              </button>
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
                {message && <div className={alertBoxStyle}>{message}</div>}
                <div className={formRowStyle}>
                  <label className={fieldLabelStyle}>
                    Usuário
                    <input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="nome.sobrenome"
                      className={fieldStyle}
                      // `pattern` quer o *source* do regex: um `RegExp` é
                      // stringificado como "/^…$/" e o navegador âncora isso em
                      // `^(?:…)$` — que nunca casa, travando o formulário.
                      pattern={USERNAME_REGEX.source}
                      title={USERNAME_REGEX_LABEL}
                      disabled={!!editingUserId}
                      required={!editingUserId}
                    />
                  </label>
                  <label className={fieldLabelStyle}>
                    Senha {editingUserId && "(deixe em branco para manter)"}
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder="••••••••"
                      className={fieldStyle}
                      required={!editingUserId}
                    />
                  </label>
                </div>

                <div className={formRowStyle}>
                  <label className={fieldLabelStyle}>
                    Nome completo
                    <input
                      type="text"
                      value={userForm.full_name}
                      onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                      placeholder="Nome Sobrenome"
                      className={fieldStyle}
                      required
                    />
                  </label>
                  <label className={fieldLabelStyle}>
                    Cargo
                    <select
                      value={userForm.role_id}
                      onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
                      className={fieldStyle}
                      required
                    >
                      <option value="">Selecione…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldLabelStyle}>
                    Setor (opcional)
                    <select
                      value={userForm.sector_id}
                      onChange={(e) => setUserForm({ ...userForm, sector_id: e.target.value })}
                      className={fieldStyle}
                    >
                      <option value="">Nenhum</option>
                      {Object.values(SECTORS).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldLabelStyle}>
                    Situação
                    <select
                      value={userForm.active ? "1" : "0"}
                      onChange={(e) => setUserForm({ ...userForm, active: e.target.value === "1" })}
                      className={fieldStyle}
                    >
                      <option value="1">Ativo</option>
                      <option value="0">Inativo</option>
                    </select>
                  </label>
                </div>

                {/* Overrides por usuário: conceder/negar além do cargo */}
                {/*<Collapsible defaultOpen className={permMatrixStyle}>*/}
                {/*  <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">*/}
                {/*    <p className={permMatrixTitleStyle}>*/}
                {/*      Permissões individuais — valem além do cargo*/}
                {/*      <span className={effectiveCountStyle}>*/}
                {/*        {effectivePerms.length}/{ALL_PERMISSIONS.length} efetivas*/}
                {/*      </span>*/}
                {/*    </p>*/}

                {/*    <ChevronDown*/}
                {/*      size={16}*/}
                {/*      className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"*/}
                {/*    />*/}
                {/*  </CollapsibleTrigger>*/}

                {/*  <CollapsibleContent className="space-y-4 pt-3">*/}
                {/*    {PERMISSION_GROUPS.map((group) => (*/}
                {/*      <div key={group.key} className={permGroupStyle}>*/}
                {/*        <h4 className={permGroupTitleStyle}>{group.label}</h4>*/}
                {/*        {group.items.map((item) => {*/}
                {/*          const mode = overrides[item.permission] ?? INHERIT;*/}
                {/*          const effective = effectivePerms.includes(item.permission);*/}
                {/*          return (*/}
                {/*            <div key={item.permission} className={permRowStyle}>*/}
                {/*            <span className={effective ? permOnStyle : permOffStyle}>*/}
                {/*              {effective ? <Check size={13} /> : <Minus size={13} />}*/}
                {/*              {item.label}*/}
                {/*            </span>*/}
                {/*              <select*/}
                {/*                className={triStateStyle}*/}
                {/*                value={mode}*/}
                {/*                onChange={(e) => {*/}
                {/*                  const mode = e.target.value;*/}
                {/*                  if (isOverrideMode(mode)) {*/}
                {/*                    setOverrides({*/}
                {/*                      ...overrides,*/}
                {/*                      [item.permission]: mode,*/}
                {/*                    });*/}
                {/*                  }*/}
                {/*                }}*/}
                {/*              >*/}
                {/*                <option value={INHERIT}>Herdar do cargo</option>*/}
                {/*                <option value={GRANT}>Conceder</option>*/}
                {/*                <option value={DENY}>Negar</option>*/}
                {/*              </select>*/}
                {/*            </div>*/}
                {/*          );*/}
                {/*        })}*/}
                {/*      </div>*/}
                {/*    ))}*/}
                {/*  </CollapsibleContent>*/}
                {/*</Collapsible>*/}

                <Collapsible defaultOpen className={permMatrixStyle}>
                  <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <p className={permMatrixTitleStyle}>
                      Permissões individuais — valem além do cargo
                      <span className={effectiveCountStyle}>
                        {effectivePerms.length}/{ALL_PERMISSIONS.length} efetivas
                      </span>
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
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {activeInGroup}/{group.items.length}
                              </span>
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

                                <select
                                  className={triStateStyle}
                                  value={mode}
                                  onChange={(e) => {
                                    const newMode = e.target.value;
                                    if (isOverrideMode(newMode)) {
                                      setOverrides({
                                        ...overrides,
                                        [item.permission]: newMode,
                                      });
                                    }
                                  }}
                                >
                                  <option value={INHERIT}>Herdar do cargo</option>
                                  <option value={GRANT}>Conceder</option>
                                  <option value={DENY}>Negar</option>
                                </select>
                              </div>
                            );
                          })}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CollapsibleContent>
                </Collapsible>

                <div className={formActionsStyle}>
                  <button type="submit" className={submitBtnStyle} disabled={loading}>
                    {loading ? "Salvando…" : editingUserId ? "Salvar alterações" : "Criar usuário"}
                  </button>
                  <button type="button" className={cancelBtnStyle} onClick={closeUserForm}>
                    Cancelar
                  </button>
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
              <table className={tableStyle}>
                <thead className={theadStyle}>
                  <tr>
                    <th className={thStyle}>Usuário</th>
                    <th className={thStyle}>Nome</th>
                    <th className={thStyle}>Cargo</th>
                    <th className={thStyle}>Setor</th>
                    <th className={thStyle}>Situação</th>
                    <th className={thStyle}>Permissões extras</th>
                    <th className={thStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody className={tbodyStyle}>
                  {users.map((u) => {
                    const grants = (u.permissions || []).filter((p) => p.granted).length;
                    const denies = (u.permissions || []).filter((p) => !p.granted).length;
                    return (
                      <tr key={u.id}>
                        <td className={tdStyle}>{u.username || "—"}</td>
                        <td className={tdStyle}>{u.full_name}</td>
                        <td className={tdStyle}>
                          <RoleBadge role={ { key: u.role!, name: u.role_name! } } />
                        </td>
                        <td className={tdStyle}>{u.sector_id ? getSector(u.sector_id)?.name || u.sector_id : "—"}</td>
                        <td className={tdStyle}>
                          <span className={u.active ? badgeUserActiveStyle : badgeUserInactiveStyle}>
                            {u.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className={tdStyle}>
                          {grants + denies === 0
                            ? "—"
                            : [
                                grants ? `${grants} concedida(s)` : null,
                                denies ? `${denies} negada(s)` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </td>
                        <td className={`${tdStyle} ${rowActionsStyle}`}>
                          {canEdit && (
                            <button
                              type="button"
                              className={editBtnStyle}
                              onClick={() => openEditUser(u)}
                              disabled={loading}
                            >
                              <Pencil size={13} /> Editar
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className={deleteBtnStyle}
                              onClick={() => setDeleteUserTarget(u)}
                              disabled={loading}
                            >
                              <Trash2 size={13} /> Excluir
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══════════ ABA CARGOS ══════════ */}
      {tab === "cargos" && (
        <>

          <div className={`${sectionTitleStyle} mt-[14px]`}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Cargos</h3>
            </div>
            {canManageRoles && !showRoleForm && (
              <button type="button" className={addUserBtnStyle} onClick={openCreateRole}>
                <Plus size={14} /> Novo cargo
              </button>
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
                {message && <div className={alertBoxStyle}>{message}</div>}
                <div className={formRowStyle}>
                  {!editingRoleId && (
                    <label className={fieldLabelStyle}>
                      Chave
                      <input
                        type="text"
                        value={roleForm.key}
                        onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
                        placeholder="coordenador"
                        className={fieldStyle}
                        pattern="[a-z][a-z0-9-]*"
                        title="Minúsculas, sem espaços (ex.: coordenador)"
                        required
                      />
                    </label>
                  )}
                  <label className={fieldLabelStyle}>
                    Nome
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      placeholder="Coordenador"
                      className={fieldStyle}
                      required
                    />
                  </label>
                  <label className={fieldLabelStyle}>
                    Descrição
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      placeholder="O que este cargo faz"
                      className={fieldStyle}
                    />
                  </label>
                </div>

                <div className={permMatrixStyle}>
                  <p className={permMatrixTitleStyle}>
                    Permissões do cargo
                    <span className={effectiveCountStyle}>
                      {rolePerms.size}/{ALL_PERMISSIONS.length}
                    </span>
                  </p>
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.key} className={permGroupStyle}>
                      <h4 className={permGroupTitleStyle}>{group.label}</h4>
                      {group.items.map((item) => (
                        <label
                          key={item.permission}
                          className={permCheckStyle}
                          onClick={(e) => {
                            /* O clique no texto do label ativa nativamente o
                               input oculto do Checkbox (também alterna o
                               estado) — e o toggle abaixo rodaria em cima:
                               dois toggles = nada parecia acontecer.
                               `preventDefault` cancela essa ativação e deixa
                               só o nosso toggle. O clique vindo do próprio
                               box é descartado pelo guard (o Base UI já
                               alternou antes, na fase de destino). */
                            e.preventDefault();
                            if ((e.target as Element).closest('[data-slot="checkbox"]')) return;
                            if (canManageRoles) toggleRolePermission(item.permission);
                          }}
                        >
                          <Checkbox
                            checked={rolePerms.has(item.permission)}
                            onCheckedChange={() => toggleRolePermission(item.permission)}
                            disabled={!canManageRoles}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>

                {canManageRoles && (
                  <div className={formActionsStyle}>
                    <button type="submit" className={submitBtnStyle} disabled={loading}>
                      {loading ? "Salvando…" : editingRoleId ? "Salvar cargo" : "Criar cargo"}
                    </button>
                    <button type="button" className={cancelBtnStyle} onClick={closeRoleForm}>
                      Fechar
                    </button>
                  </div>
                )}
              </form>
            </DialogContent>
          </Dialog>

          <div className={usersTableStyle}>
            {roles.length === 0 && <p className={emptyMsgStyle}>Nenhum cargo cadastrado.</p>}
            {roles.length > 0 && (
              <table className={tableStyle}>
                <thead className={theadStyle}>
                  <tr>
                    <th className={thStyle}>Cargo</th>
                    <th className={thStyle}>Chave</th>
                    <th className={thStyle}>Permissões</th>
                    <th className={thStyle}>Usuários</th>
                    <th className={thStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody className={tbodyStyle}>
                  {roles.map((r) => (
                    <tr key={r.id}>
                      <td className={tdStyle}>
                        <RoleBadge role={r} />

                        {r.description && (
                          <div className={roleDescriptionStyle}>{r.description}</div>
                        )}
                      </td>
                      <td className={tdStyle}>{r.key}</td>
                      <td className={tdStyle}>
                        {r.permissions.length}/{ALL_PERMISSIONS.length}
                      </td>
                      <td className={tdStyle}>{roleUsersCount(r.id)}</td>
                      <td className={`${tdStyle} ${rowActionsStyle}`}>
                        <button
                          type="button"
                          className={editBtnStyle}
                          onClick={() => openEditRole(r)}
                          disabled={loading}
                        >
                          <Pencil size={13} /> {r.built_in ? "Visualizar" : "Editar"}
                        </button>
                        {canManageRoles && !r.built_in && (
                          <button
                            type="button"
                            className={deleteBtnStyle}
                            onClick={() => setDeleteRoleTarget(r)}
                            disabled={loading}
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

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
    <span className={cn(badgeBaseStyle, roleInfo.className)}>
      <Icon size={12} />
      {role.name}
    </span>
  )
}