import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SECTORS = [
  { id: "farmacia", name: "Farmácia" },
  { id: "recepcao", name: "Recepção Saúde" },
];

const USERS = [
  {
    username: "admin",
    email: "admin.sistema@central-atendimento.local",
    password: "admin123",
    full_name: "Administrador do Sistema",
    role: "admin",
    sector_id: null,
  },
  {
    username: "atendente.recepcao",
    email: "atendente.recepcao@central-atendimento.local",
    password: "recepcao123",
    full_name: "Atendente Recepção",
    role: "attendant",
    sector_id: "recepcao",
  },
  {
    username: "atendente.farmacia",
    email: "atendente.farmacia@central-atendimento.local",
    password: "farmacia123",
    full_name: "Atendente Farmácia",
    role: "attendant",
    sector_id: "farmacia",
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

  // ── Setores ──────────────────────────────────────────────────
  for (const sector of SECTORS) {
    await prisma.sectors.upsert({
      where: { id: sector.id },
      update: {},
      create: sector,
    });
  }
  console.log(`  ✓ ${SECTORS.length} setores criados/verificados`);

  // ── Usuários ─────────────────────────────────────────────────
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.users.upsert({
      where: { username: user.username },
      update: {},
      create: {
        id: crypto.randomUUID(),
        username: user.username,
        email: user.email,
        password_hash: passwordHash,
        full_name: user.full_name,
        role: user.role,
        sector_id: user.sector_id,
      },
    });
    console.log(`  ✓ ${user.username} / ${user.password} (${user.role})`);
  }

  console.log("\nSeed concluído.");
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
