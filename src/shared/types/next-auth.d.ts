import type { Permission } from '@/shared/permissions';

/**
 * Claims de sessão do Auth.js.
 *
 * O `User` é o objeto devolvido por `authorize()` (login) e também o tipo de
 * `session.user` — por isso as claims ficam aqui e não numa interface paralela:
 * é a mesma entidade nos dois pontos, e o callback `session` apenas espelha o
 * que o callback `jwt` copiou.
 *
 * Alvo `@auth/core/types` (e não `next-auth`): o pacote `next-auth` só
 * re-exporta `Session`/`User` via `export type { … } from "@auth/core/types"`,
 * e augmentar um re-export não altera a interface original.
 */
declare module '@auth/core/types' {
  interface Session {
    /**
     * Torna `user` obrigatório.
     *
     * `DefaultSession.user?` é opcional porque uma sessão pode existir sem
     * claims de usuário (ex.: só o `expires`), mas aqui o callback `session`
     * sempre o popula — e rotas que leem `session.user.id` não querem repetir
     * `session.user?.id` em cada handler. O tipo é restringido (nunca
     * ampliado), então segue compatível com `DefaultSession`.
     */
    user: User;
  }

  interface User {
    /** Id do usuário — espelha o claim `sub` do JWT. */
    id: string;
    /** Epoch ms do login — teto absoluto da sessão (SESSION_ABSOLUTE_MAX_AGE). */
    authAt: number;
    /** Guichê; coluna string no banco, `"none"` quando ausente. */
    guiche: string;
    /** Permissões efetivas (cargo ∪ grants − denials) no momento da emissão. */
    permissions: Permission[];
    /** Epoch ms da última carga de permissões — janela de revogação (≤15min). */
    permsAt: number;
    /** Setor asignado (`null` = nenhum) — é o que `canAccessSector` compara. */
    sector: null | string;
    /** Iniciais do nome, para o avatar. Só o callback `session` preenche. */
    initials?: string;
  }
}

/**
 * Claims persistidas no JWT de sessão.
 *
 * Mesmos campos do `User`: o callback `jwt` copia do `User` no login e o
 * callback `session` os espelha de volta no `User` — o token é o veículo, o
 * `User` continua sendo a forma canônica.
 */
declare module '@auth/core/jwt' {
  interface JWT {
    /** Epoch ms do login — teto absoluto da sessão. */
    authAt: number;
    /** Guichê; coluna string no banco, `"none"` quando ausente. */
    guiche: string;
    /** Permissões efetivas no momento da emissão. */
    permissions: Permission[];
    /** Epoch ms da última carga de permissões — janela de revogação. */
    permsAt: number;
    /** Setor asignado (`null` = nenhum). */
    sector: null | string;
  }
}
