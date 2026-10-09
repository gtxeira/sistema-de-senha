"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Minus, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
import styles from "./Admin.module.css";

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

  async function handleDeleteUser(userId: string, userName: string) {
    if (
      !window.confirm(
        `Excluir o usuário "${userName}"?\n\nEsta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: "DELETE" });
      const data = await readJson<SuccessBody>(res);
      if (!res.ok) throw new Error(data.error);
      setMessage(`Usuário ${userName} excluído com sucesso.`);
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

  async function handleDeleteRole(roleId: string, roleName: string) {
    if (
      !window.confirm(
        `Excluir o cargo "${roleName}"?\n\nUsuários com este cargo ficarão órfãos — troque-os antes.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/roles?id=${roleId}`, { method: "DELETE" });
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

  if (!canView) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        <div>
          <p>ACESSO</p>
          <h2 className="font-bold">Usuários e permissões</h2>
        </div>
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "usuarios" ? styles.tabActive : ""}`}
            onClick={() => setTab("usuarios")}
          >
            Usuários
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "cargos" ? styles.tabActive : ""}`}
            onClick={() => setTab("cargos")}
          >
            Cargos e permissões
          </button>
        </div>
      </div>

      {message && <div className={styles.alertBox}>{message}</div>}

      {/* ══════════ ABA USUÁRIOS ══════════ */}
      {tab === "usuarios" && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 14 }}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Usuários cadastrados</h3>
            </div>
            {canCreate && !showUserForm && (
              <button type="button" className={styles.addUserBtn} onClick={openCreateUser}>
                <Plus size={14} /> Novo usuário
              </button>
            )}
          </div>

          {showUserForm && (
            <form className={styles.userForm} onSubmit={(e) => void handleUserSubmit(e)}>
              <div className={styles.formRow}>
                <label>
                  Usuário
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="nome.sobrenome"
                    // `pattern` quer o *source* do regex: um `RegExp` é
                    // stringificado como "/^…$/" e o navegador âncora isso em
                    // `^(?:…)$` — que nunca casa, travando o formulário.
                    pattern={USERNAME_REGEX.source}
                    title={USERNAME_REGEX_LABEL}
                    disabled={!!editingUserId}
                    required={!editingUserId}
                  />
                </label>
                <label>
                  Senha {editingUserId && "(deixe em branco para manter)"}
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="••••••••"
                    required={!editingUserId}
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label>
                  Nome completo
                  <input
                    type="text"
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    placeholder="Nome Sobrenome"
                    required
                  />
                </label>
                <label>
                  Cargo
                  <select
                    value={userForm.role_id}
                    onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
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
                <label>
                  Setor (opcional)
                  <select
                    value={userForm.sector_id}
                    onChange={(e) => setUserForm({ ...userForm, sector_id: e.target.value })}
                  >
                    <option value="">Nenhum</option>
                    {Object.values(SECTORS).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Situação
                  <select
                    value={userForm.active ? "1" : "0"}
                    onChange={(e) => setUserForm({ ...userForm, active: e.target.value === "1" })}
                  >
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                </label>
              </div>

              {/* Overrides por usuário: conceder/negar além do cargo */}
              <div className={styles.permMatrix}>
                <p className={styles.permMatrixTitle}>
                  Permissões individuais — valem além do cargo
                  <span className={styles.effectiveCount}>
                    {effectivePerms.length}/{ALL_PERMISSIONS.length} efetivas
                  </span>
                </p>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.key} className={styles.permGroup}>
                    <h4>{group.label}</h4>
                    {group.items.map((item) => {
                      const mode = overrides[item.permission] ?? INHERIT;
                      const effective = effectivePerms.includes(item.permission);
                      return (
                        <div key={item.permission} className={styles.permRow}>
                          <span className={effective ? styles.permOn : styles.permOff}>
                            {effective ? <Check size={13} /> : <Minus size={13} />}
                            {item.label}
                          </span>
                          <select
                            className={styles.triState}
                            value={mode}
                            onChange={(e) => {
                              const mode = e.target.value;
                              if (isOverrideMode(mode)) {
                                setOverrides({
                                  ...overrides,
                                  [item.permission]: mode,
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
                  </div>
                ))}
              </div>

              <div className={styles.formActions}>
                <button type="submit" disabled={loading}>
                  {loading ? "Salvando…" : editingUserId ? "Salvar alterações" : "Criar usuário"}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={closeUserForm}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className={styles.usersTable}>
            {loading && <p className={styles.loadingMsg}>Carregando…</p>}
            {!loading && users.length === 0 && (
              <p className={styles.emptyMsg}>Nenhum usuário cadastrado.</p>
            )}
            {!loading && users.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Nome</th>
                    <th>Cargo</th>
                    <th>Setor</th>
                    <th>Situação</th>
                    <th>Permissões extras</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const grants = (u.permissions || []).filter((p) => p.granted).length;
                    const denies = (u.permissions || []).filter((p) => !p.granted).length;
                    return (
                      <tr key={u.id}>
                        <td>{u.username || "—"}</td>
                        <td>{u.full_name}</td>
                        <td>
                          <span className={u.role_built_in ? styles.badgeAdmin : styles.badgeAttendant}>
                            {u.role_name || u.role || "—"}
                          </span>
                        </td>
                        <td>{u.sector_id ? getSector(u.sector_id)?.name || u.sector_id : "—"}</td>
                        <td>
                          <span className={u.active !== false ? styles.badgeAttendant : styles.badgeAdmin}>
                            {u.active !== false ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td>
                          {grants + denies === 0
                            ? "—"
                            : [
                                grants ? `${grants} concedida(s)` : null,
                                denies ? `${denies} negada(s)` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </td>
                        <td className={styles.rowActions}>
                          {canEdit && (
                            <button
                              type="button"
                              className={styles.editUserBtn}
                              onClick={() => openEditUser(u)}
                              disabled={loading}
                            >
                              <Pencil size={13} /> Editar
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className={styles.deleteUserBtn}
                              onClick={() => void handleDeleteUser(u.id, u.full_name)}
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

          <div className={styles.sectionTitle} style={{ marginTop: 14 }}>
            <div className="content-end">
              <h3 className="font-medium text-sm">Cargos</h3>
            </div>
            {canManageRoles && !showRoleForm && (
              <button type="button" className={styles.addUserBtn} onClick={openCreateRole}>
                <Plus size={14} /> Novo cargo
              </button>
            )}
          </div>

          {showRoleForm && (
            <form className={styles.userForm} onSubmit={(e) => void handleRoleSubmit(e)}>
              <div className={styles.formRow}>
                {!editingRoleId && (
                  <label>
                    Chave
                    <input
                      type="text"
                      value={roleForm.key}
                      onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
                      placeholder="coordenador"
                      pattern="[a-z][a-z0-9-]*"
                      title="Minúsculas, sem espaços (ex.: coordenador)"
                      required
                    />
                  </label>
                )}
                <label>
                  Nome
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="Coordenador"
                    required
                  />
                </label>
                <label>
                  Descrição
                  <input
                    type="text"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="O que este cargo faz"
                  />
                </label>
              </div>

              <div className={styles.permMatrix}>
                <p className={styles.permMatrixTitle}>
                  Permissões do cargo
                  <span className={styles.effectiveCount}>
                    {rolePerms.size}/{ALL_PERMISSIONS.length}
                  </span>
                </p>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.key} className={styles.permGroup}>
                    <h4>{group.label}</h4>
                    {group.items.map((item) => (
                      <label key={item.permission} className={styles.permCheck}>
                        <input
                          type="checkbox"
                          checked={rolePerms.has(item.permission)}
                          onChange={() => toggleRolePermission(item.permission)}
                          disabled={!canManageRoles}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              {canManageRoles && (
                <div className={styles.formActions}>
                  <button type="submit" disabled={loading}>
                    {loading ? "Salvando…" : editingRoleId ? "Salvar cargo" : "Criar cargo"}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeRoleForm}>
                    Fechar
                  </button>
                </div>
              )}
            </form>
          )}

          <div className={styles.usersTable}>
            {roles.length === 0 && <p className={styles.emptyMsg}>Nenhum cargo cadastrado.</p>}
            {roles.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th>Chave</th>
                    <th>Permissões</th>
                    <th>Usuários</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={r.built_in ? styles.badgeAdmin : styles.badgeAttendant}>
                          <ShieldCheck size={12} /> {r.name}
                        </span>
                        {r.description && (
                          <div className={styles.roleDescription}>{r.description}</div>
                        )}
                      </td>
                      <td>{r.key}</td>
                      <td>
                        {r.permissions.length}/{ALL_PERMISSIONS.length}
                      </td>
                      <td>{roleUsersCount(r.id)}</td>
                      <td className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.editUserBtn}
                          onClick={() => openEditRole(r)}
                          disabled={loading}
                        >
                          <Pencil size={13} /> {r.built_in ? "Visualizar" : "Editar"}
                        </button>
                        {canManageRoles && !r.built_in && (
                          <button
                            type="button"
                            className={styles.deleteUserBtn}
                            onClick={() => void handleDeleteRole(r.id, r.name)}
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
    </section>
  );
}
