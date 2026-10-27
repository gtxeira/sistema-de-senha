import type { UsersRepository } from '@/server/repositories/types';

import { beforeEach, describe, expect, it } from 'vitest';

import { errorStatus } from '@/shared/errors';

/** Fábrica devolvida por quem invoca o contrato (in-memory ou Postgres). */
export interface UsersRepoContext {
  readonly repo: UsersRepository;
  readonly seedUser: (
    data: UsersSeedUserInput,
  ) =>
    | Promise<{ id: string; username: string }>
    | { id: string; username: string };
}

/** Subconjunto do seed que os testes de contrato usam. */
export interface UsersSeedUserInput {
  readonly username: string;
  readonly active?: boolean;
  readonly full_name?: string;
  readonly password?: string;
  readonly role?: string;
  readonly sector_id?: null | string;
}

/**
 * UsersRepository contract — shared test suite.
 * Pass a factory that returns { repo, seedUser }.
 * seedUser inserts a test user and returns { id, username }.
 */
export function usersRepoContract(
  createRepo: () => Promise<UsersRepoContext> | UsersRepoContext,
): void {
  describe('UsersRepository contract', () => {
    let repo: UsersRepository;
    let seedUser: UsersRepoContext['seedUser'];

    beforeEach(async () => {
      const ctx = await createRepo();
      repo = ctx.repo;
      seedUser = ctx.seedUser;
    });

    describe('list()', () => {
      it('retorna array de usuários', async () => {
        await seedUser({ full_name: 'Teste List 1', username: 'teste.list1' });
        const users = await repo.list();
        expect(Array.isArray(users)).toBe(true);
      });

      it('cada usuário tem campos obrigatórios', async () => {
        await seedUser({ full_name: 'Teste Fields', username: 'teste.fields' });
        const users = await repo.list();
        const user = users.find((u) => u.username === 'teste.fields');
        expect(user).toBeDefined();
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('full_name');
        expect(user).toHaveProperty('role');
      });
    });

    describe('create()', () => {
      it('insere e retorna usuário com success: true', async () => {
        const result = await repo.create({
          full_name: 'Teste Create',
          password: 'test123456',
          role: 'attendant',
          sector_id: 'farmacia',
          username: `user.create.${Date.now()}`,
        });

        expect(result.success).toBe(true);
        expect(result.user).toHaveProperty('id');
        expect(result.user.username).toMatch(/^user\.create\./);
        expect(result.user.full_name).toBe('Teste Create');
      });

      it('valida formato de username (nome.sobrenome)', async () => {
        // "user!" has special char — should be rejected
        try {
          await repo.create({
            full_name: 'Teste Inválido',
            password: 'test123456',
            username: 'user!',
          });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(errorStatus(error)).toBe(400);
        }

        // "user name" has space — should be rejected
        try {
          await repo.create({
            full_name: 'Teste Espaço',
            password: 'test123456',
            username: 'user name',
          });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(errorStatus(error)).toBe(400);
        }
      });

      it('rejeita username duplicado', async () => {
        const username = `dup.user.${Date.now()}`;
        await repo.create({
          full_name: 'Primeiro',
          password: 'test123456',
          username,
        });

        await expect(
          repo.create({
            full_name: 'Segundo',
            password: 'test123456',
            username,
          }),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('define role padrão como attendant', async () => {
        const result = await repo.create({
          full_name: 'Teste Role Default',
          password: 'test123456',
          username: `role.default.${Date.now()}`,
        });
        expect(result.user.role).toBe('attendant');
      });
    });

    describe('update()', () => {
      it('atualiza dados básicos', async () => {
        const { id } = await seedUser({
          full_name: 'Antes',
          username: `update.me.${Date.now()}`,
        });
        const user = await repo.update(id, {
          full_name: 'Depois',
          sector_id: 'recepcao',
        });
        expect(user.full_name).toBe('Depois');
        expect(user.sector_id).toBe('recepcao');
      });

      it('troca o cargo pela chave', async () => {
        const { id } = await seedUser({
          full_name: 'Cargo Antes',
          username: `update.role.${Date.now()}`,
        });
        const user = await repo.update(id, { role: 'admin' });
        expect(user.role).toBe('admin');
      });

      it('senha em branco é ignorada (não altera a senha atual)', async () => {
        const { id } = await seedUser({
          full_name: 'Senha',
          username: `update.pw.${Date.now()}`,
        });
        const user = await repo.update(id, {
          full_name: 'Nome Atualizado',
          password: '',
        });
        expect(user.full_name).toBe('Nome Atualizado');
      });

      it('404 para id inexistente', async () => {
        await expect(
          repo.update('00000000-0000-0000-0000-000000000000', {
            full_name: 'Nada',
          }),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('setPermissions()', () => {
      it('substitui os overrides do usuário', async () => {
        const { id } = await seedUser({
          full_name: 'Perms',
          username: `perms.set.${Date.now()}`,
        });

        await repo.setPermissions(id, [
          { granted: true, permission: 'filas.resetar' },
        ]);
        // substituição completa: uma segunda chamada zera a anterior
        await repo.setPermissions(id, [
          { granted: false, permission: 'usuarios.ver' },
        ]);

        const user = (await repo.list()).find((u) => u.id === id);
        expect(user?.permissions).toEqual([
          { granted: false, permission: 'usuarios.ver' },
        ]);
      });

      it('rejeita chave de permissão desconhecida (400)', async () => {
        const { id } = await seedUser({
          full_name: 'Bad',
          username: `perms.bad.${Date.now()}`,
        });
        await expect(
          repo.setPermissions(id, [
            { granted: true, permission: 'permissao.fantasma' },
          ]),
        ).rejects.toMatchObject({ status: 400 });
      });

      it('lista vazia limpa os overrides', async () => {
        const { id } = await seedUser({
          full_name: 'Clear',
          username: `perms.clear.${Date.now()}`,
        });
        await repo.setPermissions(id, [
          { granted: true, permission: 'filas.resetar' },
        ]);
        await repo.setPermissions(id, []);

        const user = (await repo.list()).find((u) => u.id === id);
        expect(user?.permissions).toEqual([]);
      });
    });

    describe('remove()', () => {
      it('deleta usuário existente sem erro', async () => {
        const { id } = await seedUser({
          full_name: 'Remove Me',
          username: `remove.me.${Date.now()}`,
        });
        await expect(repo.remove(id)).resolves.toBeUndefined();
      });

      it('lança erro para ID inexistente', async () => {
        await expect(
          repo.remove('00000000-0000-0000-0000-000000000000'),
        ).rejects.toMatchObject({ status: 404 });
      });
    });
  });
}
