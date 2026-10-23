import type { rolesModel } from '../src/server/generated/prisma/models/roles';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../src/server/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SECTORS = [
  { id: 'farmacia', name: 'Farmácia' },
  { id: 'recepcao', name: 'Recepção Saúde' },
];

// TODO: Adicionar o seed diretamente no armazenamento S3
const DEFAULT_NEWS = {
  title: 'Bem-vindo ao Sistema de Senhas',
  image_url: '/news/1789083615350-os7rdzpymeb.jpeg',
};

const USERS = [
  {
    email: 'admin.sistema@central-atendimento.local',
    full_name: 'Administrador do Sistema',
    password: 'admin123',
    role: 'admin',
    sector_id: null,
    username: 'admin',
  },
  {
    email: 'atendente.recepcao@central-atendimento.local',
    full_name: 'Atendente Recepção',
    password: 'recepcao123',
    role: 'attendant',
    sector_id: 'recepcao',
    username: 'atendente.recepcao',
  },
  {
    email: 'atendente.farmacia@central-atendimento.local',
    full_name: 'Atendente Farmácia',
    password: 'farmacia123',
    role: 'attendant',
    sector_id: 'farmacia',
    username: 'atendente.farmacia',
  },
];

async function main() {
  // ── Limpa usuários de teste e legados ────────────────────────
  const keepUsernames = USERS.map((u) => u.username);
  const deleted = await prisma.users.deleteMany({
    where: { NOT: { username: { in: keepUsernames } } },
  });
  if (deleted.count > 0) {
    console.log(`  ✓ ${deleted.count} usuários antigos removidos`);
  }

  // ── Cargos built-in (criados pela migration; garantidos aqui
  //    também para bancos criados apenas com o seed) ────────────
  const roles: Record<string, rolesModel> = {};
  for (const [key, name] of [
    ['admin', 'Administrador'],
    ['attendant', 'Atendente'],
  ]) {
    roles[key] = await prisma.roles.upsert({
      create: { name, built_in: true, key },
      update: {},
      where: { key },
    });
  }
  console.log(`  ✓ ${Object.keys(roles).length} cargos criados/verificados`);

  // ── Setores ──────────────────────────────────────────────────
  for (const sector of SECTORS) {
    await prisma.sectors.upsert({
      create: sector,
      update: {},
      where: { id: sector.id },
    });
  }
  console.log(`  ✓ ${SECTORS.length} setores criados/verificados`);

  // ── Notícias ────────────────────────────────────────────────
  const existingNews = await prisma.news.findFirst({
    where: { image_url: DEFAULT_NEWS.image_url },
  });
  if (!existingNews) {
    await prisma.news.create({ data: DEFAULT_NEWS });
    console.log(`  ✓ Notícia padrão criada`);
  } else {
    console.log(`  ✓ Notícia padrão já existe`);
  }

  // ── Usuários ─────────────────────────────────────────────────
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.users.upsert({
      create: {
        id: crypto.randomUUID(),
        email: user.email,
        full_name: user.full_name,
        password_hash: passwordHash,
        role_id: roles[user.role].id,
        sector_id: user.sector_id,
        username: user.username,
      },
      update: {},
      where: { username: user.username },
    });
    console.log(`  ✓ ${user.username} / ${user.password} (${user.role})`);
  }

  console.log('\nSeed concluído.');
}

main()
  .catch((error) => {
    console.error('Erro no seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
